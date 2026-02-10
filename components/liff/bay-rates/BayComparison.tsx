'use client';

import { Language } from '@/lib/liff/translations';

interface BayComparisonProps {
  language: Language;
}

const translations = {
  en: {
    title: 'Choose Your Bay',
    subtitle: 'Select the perfect experience for your skill level',
    socialBays: 'Social Bays',
    socialAvailable: '3 Available',
    socialDescription: 'Perfect for beginners, groups & social play',
    socialIdealFor: 'Ideal For:',
    socialIdeal1: 'New to golf & beginners',
    socialIdeal2: 'Groups of 1-5 players',
    socialIdeal3: 'Casual, fun experiences',
    socialIdeal4: 'Celebrations & parties',
    socialFeatures: 'Features:',
    socialFeature1: 'Auto tee system',
    socialFeature2: '100+ courses available',
    socialFeature3: 'Multiple game modes',
    socialFeature4: 'Social atmosphere',
    aiLab: 'AI Lab',
    aiAvailable: '1 Available',
    aiDescription: 'Advanced tech for serious players',
    aiIdealFor: 'Ideal For:',
    aiIdeal1: 'Intermediate+ players',
    aiIdeal2: 'Solo or duo (1-2 players)',
    aiIdeal3: 'Serious improvement focus',
    aiIdeal4: 'Left & right-handed',
    aiFeatures: 'Advanced Features:',
    aiFeature1: 'AI swing analysis',
    aiFeature2: 'Dual-angle video replay',
    aiFeature3: '4K BenQ projector',
    aiFeature4: 'Optimized setup',
  },
  th: {
    title: 'เลือกเบย์ของคุณ',
    subtitle: 'เลือกประสบการณ์ที่เหมาะกับระดับทักษะของคุณ',
    socialBays: 'Social Bays',
    socialAvailable: '3 เบย์',
    socialDescription: 'เหมาะสำหรับมือใหม่ กลุ่ม และเล่นสังสรรค์',
    socialIdealFor: 'เหมาะสำหรับ:',
    socialIdeal1: 'มือใหม่หัดเล่นกอล์ฟ',
    socialIdeal2: 'กลุ่ม 1-5 คน',
    socialIdeal3: 'เล่นสนุกสบายๆ',
    socialIdeal4: 'งานเลี้ยงและปาร์ตี้',
    socialFeatures: 'คุณสมบัติ:',
    socialFeature1: 'ระบบทีอัตโนมัติ',
    socialFeature2: 'สนามกว่า 100+ สนาม',
    socialFeature3: 'โหมดเกมหลากหลาย',
    socialFeature4: 'บรรยากาศสังสรรค์',
    aiLab: 'AI Lab',
    aiAvailable: '1 เบย์',
    aiDescription: 'เทคโนโลยีขั้นสูงสำหรับนักกอล์ฟจริงจัง',
    aiIdealFor: 'เหมาะสำหรับ:',
    aiIdeal1: 'ผู้เล่นระดับกลางขึ้นไป',
    aiIdeal2: 'เล่นคนเดียวหรือคู่ (1-2 คน)',
    aiIdeal3: 'มุ่งพัฒนาอย่างจริงจัง',
    aiIdeal4: 'ถนัดซ้ายและขวา',
    aiFeatures: 'ฟีเจอร์ขั้นสูง:',
    aiFeature1: 'วิเคราะห์สวิงด้วย AI',
    aiFeature2: 'วิดีโอรีเพลย์ 2 มุม',
    aiFeature3: 'โปรเจคเตอร์ 4K BenQ',
    aiFeature4: 'ตั้งค่าเฉพาะบุคคล',
  },
  ja: {
    title: 'ベイを選ぶ',
    subtitle: 'スキルレベルに合った最適な体験を',
    socialBays: 'ソーシャルベイ',
    socialAvailable: '3ベイ',
    socialDescription: '初心者・グループ・カジュアルプレーに最適',
    socialIdealFor: 'おすすめ:',
    socialIdeal1: 'ゴルフ初心者の方',
    socialIdeal2: '1〜5名のグループ',
    socialIdeal3: '気軽に楽しむ方',
    socialIdeal4: 'パーティー・お祝い',
    socialFeatures: '機能:',
    socialFeature1: '自動ティーシステム',
    socialFeature2: '100以上のコース',
    socialFeature3: '複数のゲームモード',
    socialFeature4: 'ソーシャルな雰囲気',
    aiLab: 'AI Lab',
    aiAvailable: '1ベイ',
    aiDescription: '本格派プレーヤー向け最新テクノロジー',
    aiIdealFor: 'おすすめ:',
    aiIdeal1: '中級者以上',
    aiIdeal2: 'ソロまたはデュオ（1〜2名）',
    aiIdeal3: '本格的な上達を目指す方',
    aiIdeal4: '左利き・右利き対応',
    aiFeatures: '高度な機能:',
    aiFeature1: 'AIスイング分析',
    aiFeature2: 'デュアルアングルビデオ',
    aiFeature3: '4K BenQプロジェクター',
    aiFeature4: '最適化されたセットアップ',
  },
  zh: {
    title: '选择球位',
    subtitle: '选择适合您水平的最佳体验',
    socialBays: 'Social Bays',
    socialAvailable: '3个球位',
    socialDescription: '适合初学者、团体和休闲娱乐',
    socialIdealFor: '适合人群:',
    socialIdeal1: '高尔夫初学者',
    socialIdeal2: '1-5人团体',
    socialIdeal3: '休闲娱乐体验',
    socialIdeal4: '聚会和派对',
    socialFeatures: '功能特点:',
    socialFeature1: '自动发球系统',
    socialFeature2: '100+球场可选',
    socialFeature3: '多种游戏模式',
    socialFeature4: '社交氛围',
    aiLab: 'AI Lab',
    aiAvailable: '1个球位',
    aiDescription: '专业球手的先进科技体验',
    aiIdealFor: '适合人群:',
    aiIdeal1: '中级及以上球手',
    aiIdeal2: '单人或双人（1-2人）',
    aiIdeal3: '专注提升技术',
    aiIdeal4: '左右手均适用',
    aiFeatures: '高级功能:',
    aiFeature1: 'AI挥杆分析',
    aiFeature2: '双角度视频回放',
    aiFeature3: '4K BenQ投影仪',
    aiFeature4: '优化设置',
  },
};

export default function BayComparison({ language }: BayComparisonProps) {
  const t = translations[language];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500">{t.subtitle}</p>
      </div>

      <div className="space-y-4">
        {/* Social Bays */}
        <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-green-800">{t.socialBays}</h3>
              <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
                {t.socialAvailable}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-700 font-medium mb-3">{t.socialDescription}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <h4 className="text-xs font-semibold text-green-800 mb-1">{t.socialIdealFor}</h4>
              <ul className="space-y-1">
                {[t.socialIdeal1, t.socialIdeal2, t.socialIdeal3, t.socialIdeal4].map((item, i) => (
                  <li key={i} className="flex items-start text-xs">
                    <svg className="w-3 h-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-green-800 mb-1">{t.socialFeatures}</h4>
              <ul className="space-y-1">
                {[t.socialFeature1, t.socialFeature2, t.socialFeature3, t.socialFeature4].map((item, i) => (
                  <li key={i} className="flex items-start text-xs">
                    <svg className="w-3 h-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* AI Lab */}
        <div className="border-2 border-purple-500 rounded-lg p-4 bg-purple-50 relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-purple-800">{t.aiLab}</h3>
              <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">
                {t.aiAvailable}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-700 font-medium mb-3">{t.aiDescription}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <h4 className="text-xs font-semibold text-purple-800 mb-1">{t.aiIdealFor}</h4>
              <ul className="space-y-1">
                {[t.aiIdeal1, t.aiIdeal2, t.aiIdeal3, t.aiIdeal4].map((item, i) => (
                  <li key={i} className="flex items-start text-xs">
                    <svg className="w-3 h-3 text-purple-500 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-purple-800 mb-1">{t.aiFeatures}</h4>
              <ul className="space-y-1">
                {[t.aiFeature1, t.aiFeature2, t.aiFeature3, t.aiFeature4].map((item, i) => (
                  <li key={i} className="flex items-start text-xs">
                    <svg className="w-3 h-3 text-purple-500 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
