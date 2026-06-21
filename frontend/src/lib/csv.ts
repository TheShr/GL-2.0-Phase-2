// Helper to split CSV line, handling quoted columns (like coordinates "(lat, lon)")
export const splitCsvLine = (line: string): string[] => {
  return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(item => {
    let clean = item.trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.substring(1, clean.length - 1);
    }
    return clean;
  });
};
