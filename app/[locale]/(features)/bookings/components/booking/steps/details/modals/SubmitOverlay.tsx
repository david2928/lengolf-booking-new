'use client';

import { useTranslations } from 'next-intl';

// Add loading animation components
const LoadingOverlay = ({ steps, currentStep, title, subtitle }: { steps: string[], currentStep: number, title: string, subtitle: string }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        <div className="text-center mb-4">
          <div className="inline-block animate-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
              <circle cx="12" cy="8" r="7" />
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
            </svg>
          </div>
          <h3 className="text-xl font-bold mt-2">{title}</h3>
          <p className="text-gray-600">{subtitle}</p>
        </div>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center">
              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                index < currentStep ? 'bg-green-100 text-green-600' :
                index === currentStep ? 'bg-green-600 text-white animate-pulse' :
                'bg-gray-100 text-gray-400'
              }`}>
                {index < currentStep ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="ml-4">
                <p className={`font-medium ${
                  index < currentStep ? 'text-green-600' :
                  index === currentStep ? 'text-gray-900' :
                  'text-gray-400'
                }`}>
                  {step}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-green-600 h-2.5 rounded-full transition-all duration-500 ease-in-out"
              style={{ width: `${Math.min((currentStep / (steps.length - 1)) * 100, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SubmitOverlayProps {
  isOpen: boolean;
  steps: string[];
  currentStep: number;
}

export function SubmitOverlay({ isOpen, steps, currentStep }: SubmitOverlayProps) {
  const t = useTranslations('bookings.detailsStep');

  if (!isOpen) return null;

  return (
    <LoadingOverlay
      steps={steps}
      currentStep={currentStep}
      title={t('loadingOverlayTitle')}
      subtitle={t('loadingOverlaySubtitle')}
    />
  );
}
