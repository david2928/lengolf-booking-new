interface ProgressBarProps {
  currentStep: number;
  steps: Array<{
    title: string;
    description: string;
  }>;
}

export default function ProgressBar({ currentStep, steps }: ProgressBarProps) {
  return (
    <div className="mb-8">
      {/* Desktop Progress Bar */}
      <div className="relative max-w-7xl mx-auto px-4 hidden md:block">
        <div className="flex justify-between relative">
          {/* Progress line */}
          <div 
            className="absolute h-0.5 bg-green-600 transition-all duration-300" 
            style={{ 
              top: '1.5rem',
              left: '2.5rem',
              width: `calc(${((currentStep - 1) / (steps.length - 1)) * 100}% - 5rem)`
            }} 
          />
          <div 
            className="absolute h-0.5 bg-gray-200" 
            style={{ 
              top: '1.5rem',
              left: '2.5rem',
              width: 'calc(100% - 5rem)'
            }} 
          />
          
          {steps.map((step, index) => (
            <div key={index} className="flex items-center">
              <div 
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full relative z-10
                  ${index + 1 <= currentStep ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {index + 1}
              </div>
              <div className="ml-4">
                <p className={`text-lg font-semibold ${
                  index + 1 <= currentStep ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {step.title}
                </p>
                <p className="text-sm text-gray-500">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Progress Bar */}
      <div className="md:hidden px-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 relative">
            {/* Progress line */}
            <div className="absolute inset-0 flex items-center">
              <div className="h-0.5 w-full bg-gray-200" />
              <div 
                className="absolute h-0.5 bg-green-600 transition-all duration-300" 
                style={{ 
                  width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`
                }} 
              />
            </div>
            <div className="relative flex justify-between">
              {steps.map((step, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div 
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full z-10
                      ${index + 1 <= currentStep ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {index + 1}
                  </div>
                  <p className={`mt-2 text-xs ${
                    index + 1 <= currentStep ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 