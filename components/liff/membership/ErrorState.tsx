interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
        <div className="text-red-600 text-center mb-4">
          <svg
            className="w-16 h-16 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-xl font-bold">Error</h2>
        </div>
        <p className="text-gray-600 text-center mb-4">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
