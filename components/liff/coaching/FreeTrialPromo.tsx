import { Language, coachingTranslations } from '@/lib/liff/translations';

interface FreeTrialPromoProps {
  language: Language;
}

export default function FreeTrialPromo({ language }: FreeTrialPromoProps) {
  const t = coachingTranslations[language];

  const benefits = [
    t.freeTrialBenefit1,
    t.freeTrialBenefit2,
    t.freeTrialBenefit3,
  ];

  return (
    <section className="mb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a4d3a] via-[#2d5a47] to-[#1a4d3a] shadow-xl">
        {/* Background pattern overlay */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          {/* Header */}
          <div className="text-center mb-5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-1 tracking-tight">
              {language === 'en' ? (
                <>Free Trial 1 Hour</>
              ) : (
                <>ทดลองเรียน ฟรี 1 ชั่วโมง</>
              )}
            </h2>
            <p className="text-lg text-green-100 font-medium">
              {t.freeTrialSubtitle}
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-6">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-400/20 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-green-300"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span className="text-white text-lg font-medium">{benefit}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <a
            href="https://lin.ee/uxQpIXn"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full bg-white text-[#1a4d3a] px-6 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 active:bg-gray-200 transition-colors shadow-lg"
          >
            {/* LINE icon */}
            <svg className="w-7 h-7 text-[#06C755]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            <span>{t.freeTrialCta}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
