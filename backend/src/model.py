import torch
import torch.nn as nn
import torch.nn.functional as F

class GATv2Layer(nn.Module):
    """
    Vectorized GATv2 Layer implemented in PyTorch supporting 3D batched inputs.
    GATv2 uses a dynamic attention mechanism:
    alpha_ij = softmax_j( a^T * LeakyReLU( W * [h_i || h_j] ) )
    """
    def __init__(self, in_features, out_features, dropout=0.1, alpha_slope=0.2):
        super(GATv2Layer, self).__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.dropout = dropout
        
        # Learnable projection weights
        self.W = nn.Linear(in_features, out_features, bias=False)
        # Attention parameter vector
        self.a = nn.Linear(2 * out_features, 1, bias=False)
        
        self.leakyrelu = nn.LeakyReLU(alpha_slope)
        self.dropout_layer = nn.Dropout(dropout)

    def forward(self, x, edge_index):
        """
        x: Node features tensor of shape [batch_size, num_nodes, in_features]
        edge_index: Adjacency edge indices of shape [2, num_edges]
        """
        B, num_nodes, _ = x.size()
        h = self.W(x)  # Projection: [batch_size, num_nodes, out_features]
        
        # Extract source and target indices from edge_index
        source_idx = edge_index[0]  # [num_edges]
        target_idx = edge_index[1]  # [num_edges]
        
        # Extract features for source and target nodes across batch dimension
        h_source = h[:, source_idx, :]  # [batch_size, num_edges, out_features]
        h_target = h[:, target_idx, :]  # [batch_size, num_edges, out_features]
        
        # Concatenate source and target features
        h_concat = torch.cat([h_source, h_target], dim=-1)  # [batch_size, num_edges, 2 * out_features]
        
        # Calculate raw attention scores
        attn_scores = self.leakyrelu(self.a(h_concat)).squeeze(-1)  # [batch_size, num_edges]
        attn_scores = torch.clamp(attn_scores, min=-10.0, max=10.0)
        
        # Compute softmax over neighbors for each node using batched scatter operations
        exp_attn = torch.exp(attn_scores)  # [batch_size, num_edges]
        
        # Expand index to match batch dimension
        index = source_idx.unsqueeze(0).expand(B, -1)  # [batch_size, num_edges]
        
        sum_exp = torch.zeros(B, num_nodes, device=x.device)
        sum_exp.scatter_add_(1, index, exp_attn)  # [batch_size, num_nodes]
        
        # Gather sum values for normalization
        gather_sum = torch.gather(sum_exp, 1, index)  # [batch_size, num_edges]
        
        # Normalized attention weights
        alpha = exp_attn / (gather_sum + 1e-12)  # [batch_size, num_edges]
        alpha = self.dropout_layer(alpha)
        
        # Aggregate features: out[i] = sum_{j in N(i)} alpha_ij * h_j
        weighted_features = h_target * alpha.unsqueeze(-1)  # [batch_size, num_edges, out_features]
        
        # Expand index for output gathering
        index_out = index.unsqueeze(-1).expand(-1, -1, self.out_features)  # [batch_size, num_edges, out_features]
        
        out = torch.zeros(B, num_nodes, self.out_features, device=x.device)
        out.scatter_add_(1, index_out, weighted_features)  # [batch_size, num_nodes, out_features]
        
        return out


class STGATModel(nn.Module):
    """
    Spatio-Temporal Graph Attention Network.
    Processes sequence data: [batch_size, seq_len, num_nodes, num_features]
    """
    def __init__(self, num_nodes, in_features, spatial_hidden, temporal_hidden, dropout=0.2, log_transform=False):
        super(STGATModel, self).__init__()
        self.num_nodes = num_nodes
        self.spatial_hidden = spatial_hidden
        self.temporal_hidden = temporal_hidden
        self.log_transform = log_transform
        
        # Spatial Graph Attention Layer (for static physical topology)
        self.gat = GATv2Layer(in_features, spatial_hidden, dropout=dropout)
        
        # Learnable node embeddings for adaptive/dynamic topology matrix
        self.E1 = nn.Parameter(torch.empty(num_nodes, 10))
        self.E2 = nn.Parameter(torch.empty(num_nodes, 10))
        nn.init.xavier_uniform_(self.E1)
        nn.init.xavier_uniform_(self.E2)
        
        # Parallel projection branch for learning dynamic spatiotemporal dependencies
        self.adaptive_conv = nn.Linear(in_features, spatial_hidden)
        
        # Temporal Gated Recurrent Unit (GRU) Layer
        # Input to GRU is the blended spatial embedding output of GAT and adaptive conv layers
        self.gru = nn.GRU(spatial_hidden, temporal_hidden, batch_first=True)
        
        # Prediction Head
        self.risk_head = nn.Linear(temporal_hidden, 1)      # Predicted illegal parking risk index

    def forward(self, x_seq, edge_index):
        """
        x_seq: Tensor of shape [batch_size, seq_len, num_nodes, in_features]
        edge_index: Tensor of shape [2, num_edges]
        """
        # Shape verification / Assertions
        assert len(x_seq.shape) == 4, f"Expected 4D input tensor [Batch, Time, Nodes, Features], got shape {x_seq.shape}"
        assert x_seq.shape[2] == self.num_nodes, f"Input node count {x_seq.shape[2]} does not match model node count {self.num_nodes}"
        
        batch_size, seq_len, num_nodes, num_features = x_seq.size()
        
        # Flatten spatial-temporal sequence to process spatial layers in parallel
        # Shape: [batch_size * seq_len, num_nodes, num_features]
        x_flat = x_seq.view(batch_size * seq_len, num_nodes, num_features)
        assert x_flat.shape == (batch_size * seq_len, num_nodes, num_features), f"Flat shape mismatch, got {x_flat.shape}"
        
        # 1. Physical Spatial branch: Run GATv2 layer processing static road network topology
        # spatial_out_gat shape: [batch_size * seq_len, num_nodes, spatial_hidden]
        spatial_out_gat = self.gat(x_flat, edge_index)
        assert spatial_out_gat.shape == (batch_size * seq_len, num_nodes, self.spatial_hidden), f"GAT output shape mismatch, got {spatial_out_gat.shape}"
        
        # 2. Adaptive Spatial branch: Learn dynamic spatiotemporal dependencies
        # Compute A_adaptive = Softmax(ReLU(E_1 @ E_2.T), dim=-1)
        # Shape: [num_nodes, num_nodes]
        A_adaptive = F.softmax(F.relu(torch.matmul(self.E1, self.E2.t())), dim=-1)
        assert A_adaptive.shape == (num_nodes, num_nodes), f"A_adaptive shape mismatch, got {A_adaptive.shape}"
        
        # Project node features to hidden space
        # Shape: [batch_size * seq_len, num_nodes, spatial_hidden]
        h_adaptive = self.adaptive_conv(x_flat)
        assert h_adaptive.shape == (batch_size * seq_len, num_nodes, self.spatial_hidden), f"Adaptive project shape mismatch, got {h_adaptive.shape}"
        
        # Propagate using A_adaptive: A_adaptive @ h_adaptive (fully vectorized batch multiplication)
        # Shape: [batch_size * seq_len, num_nodes, spatial_hidden]
        spatial_out_adaptive = torch.matmul(A_adaptive, h_adaptive)
        assert spatial_out_adaptive.shape == (batch_size * seq_len, num_nodes, self.spatial_hidden), f"Adaptive conv shape mismatch, got {spatial_out_adaptive.shape}"
        
        # 3. Blend local physical topology representation and non-local adaptive spatiotemporal correlations
        # Shape: [batch_size * seq_len, num_nodes, spatial_hidden]
        spatial_out = spatial_out_gat + spatial_out_adaptive
        assert spatial_out.shape == (batch_size * seq_len, num_nodes, self.spatial_hidden), f"Blended output shape mismatch, got {spatial_out.shape}"
        
        # Reshape to separate sequence: [batch_size, seq_len, num_nodes, spatial_hidden]
        spatial_out = spatial_out.view(batch_size, seq_len, num_nodes, self.spatial_hidden)
        assert spatial_out.shape == (batch_size, seq_len, num_nodes, self.spatial_hidden), f"Reshaped spatial output shape mismatch, got {spatial_out.shape}"
        
        # Permute to feed into GRU per node
        # We process each node's sequence through GRU
        # Shape for GRU input: [batch_size * num_nodes, seq_len, spatial_hidden]
        gru_in = spatial_out.permute(0, 2, 1, 3).reshape(batch_size * num_nodes, seq_len, self.spatial_hidden)
        assert gru_in.shape == (batch_size * num_nodes, seq_len, self.spatial_hidden), f"GRU input shape mismatch, got {gru_in.shape}"
        
        # GRU forward
        # gru_out shape: [batch_size * num_nodes, seq_len, temporal_hidden]
        gru_out, h_n = self.gru(gru_in)
        assert gru_out.shape == (batch_size * num_nodes, seq_len, self.gru.hidden_size), f"GRU output shape mismatch, got {gru_out.shape}"
        
        # We take the final time step hidden state for forecasting: [batch_size * num_nodes, temporal_hidden]
        h_last = h_n.squeeze(0)
        assert h_last.shape == (batch_size * num_nodes, self.gru.hidden_size), f"GRU final state shape mismatch, got {h_last.shape}"
        
        # Predict violation risk index (sigmoid limits to [0, 1])
        risk_pred = torch.sigmoid(self.risk_head(h_last))
        assert risk_pred.shape == (batch_size * num_nodes, 1), f"Prediction shape mismatch, got {risk_pred.shape}"
        
        # Reshape outputs to [batch_size, num_nodes]
        risk_pred = risk_pred.view(batch_size, num_nodes)
        assert risk_pred.shape == (batch_size, num_nodes), f"Reshaped prediction shape mismatch, got {risk_pred.shape}"
        
        return risk_pred

if __name__ == "__main__":
    print("Testing Vectorized ST-GAT Model Initialization and Forward Pass...")
    
    # 1. Define dummy size parameters
    num_nodes = 5
    in_features = 8
    seq_len = 4
    batch_size = 2
    
    # 2. Create mock sequence input: [batch_size, seq_len, num_nodes, in_features]
    mock_x = torch.randn(batch_size, seq_len, num_nodes, in_features)
    
    # 3. Create mock directed edges index
    mock_edges = torch.tensor([
        [0, 1, 2, 3, 4, 1, 2, 3, 4, 0], # Source
        [1, 2, 3, 4, 0, 0, 1, 2, 3, 4]  # Target
    ], dtype=torch.long)
    
    # 4. Instantiate Model
    model = STGATModel(num_nodes=num_nodes, in_features=in_features, 
                       spatial_hidden=16, temporal_hidden=8)
    
    # 5. Forward Pass
    try:
        risk = model(mock_x, mock_edges)
        print("Vectorized Forward Pass Successful!")
        print("Risk Output Shape:", risk.shape)
        print("Sample Risk Values:", risk[0].detach().numpy())
    except Exception as e:
        print("Vectorized Test Failed with Error:", str(e))
