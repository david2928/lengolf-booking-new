interface SimulatorHeaderProps {
  playerName?: string;
}

export default function SimulatorHeader({ playerName }: SimulatorHeaderProps) {
  return (
    <div className="bg-[#005a32] px-4 py-4 text-white">
      <h1 className="text-lg font-bold">
        <span role="img" aria-label="golfer">🏌️</span> My Simulator Stats
      </h1>
      {playerName && (
        <p className="text-sm text-green-100 mt-0.5">Welcome, {playerName}</p>
      )}
    </div>
  );
}
