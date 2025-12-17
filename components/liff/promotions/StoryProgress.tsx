interface StoryProgressProps {
  total: number;
  current: number;
  progress: number; // 0-100
}

export default function StoryProgress({ total, current, progress }: StoryProgressProps) {
  return (
    <div className="flex gap-1 w-full px-2">
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-white transition-all duration-100 ease-linear"
            style={{
              width: index < current ? '100%' : index === current ? `${progress}%` : '0%',
            }}
          />
        </div>
      ))}
    </div>
  );
}
