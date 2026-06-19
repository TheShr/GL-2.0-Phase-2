"use client";

interface TimelineScrubberProps {
  selectedTime: string;
  onSelectTime: (time: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i * 2);
const TIME_MAP: Record<number, string> = {
  0: "00:00", 2: "00:00", 4: "04:00", 6: "04:00",
  8: "08:00", 10: "08:00", 12: "12:00", 14: "12:00",
  16: "16:00", 18: "16:00", 20: "20:00", 22: "20:00"
};

function hourToSliderValue(time: string): number {
  const hour = parseInt(time.split(":")[0], 10);
  return hour;
}

export default function TimelineScrubber({ selectedTime, onSelectTime }: TimelineScrubberProps) {
  const sliderValue = hourToSliderValue(selectedTime);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const snapped = TIME_MAP[val] || "08:00";
    onSelectTime(snapped);
  };

  return (
    <div className="timeline-bar h-10 flex items-center px-6 gap-4 shrink-0 relative z-[55]">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Forecast</span>

      <div className="flex-1 flex items-center gap-0 relative">
        {/* Hour markers */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none px-[7px]">
          {HOURS.map(h => (
            <span
              key={h}
              className={`text-[7px] font-mono font-semibold ${
                hourToSliderValue(selectedTime) === h ? 'text-blue-600' : 'text-slate-300'
              }`}
            >
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>

        {/* Slider */}
        <input
          type="range"
          min="0"
          max="22"
          step="2"
          value={sliderValue}
          onChange={handleChange}
          className="timeline-slider w-full relative z-10 mt-3"
        />
      </div>

      <span className="text-[10px] font-bold text-blue-600 font-mono shrink-0 min-w-[38px] text-right">{selectedTime}</span>
    </div>
  );
}
