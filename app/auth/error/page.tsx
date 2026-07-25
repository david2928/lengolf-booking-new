'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

/**
 * This page lives OUTSIDE the `[locale]` segment because its exact URL is
 * registered as an OAuth callback URL with the providers — middleware
 * deliberately skips next-intl for it (see middleware.ts). That means
 * `useTranslations` is unavailable here, so the small set of strings it needs
 * is carried inline and selected from the `NEXT_LOCALE` cookie that next-intl
 * already maintains.
 */
const LOCALES = ['en', 'th', 'ja', 'ko', 'zh'] as const;
type Locale = (typeof LOCALES)[number];

const COPY: Record<Locale, { heading: string; tryAgain: string; home: string; messages: Record<string, string>; fallback: string }> = {
  en: {
    heading: 'Sign-in did not complete',
    tryAgain: 'Back to sign-in',
    home: 'Back to Home',
    fallback: 'Something went wrong while signing in. You can try again, or book as a guest — no account needed.',
    messages: {
      AccessDenied: 'Sign-in was cancelled or not permitted. You can try again, or book as a guest — no account needed.',
      Configuration: 'Sign-in is temporarily unavailable. You can still book as a guest — no account needed.',
      Verification: 'That sign-in link has expired or was already used.',
      OAuthSignin: 'We could not reach that sign-in provider. You can try again, or book as a guest.',
      OAuthCallback: 'We could not complete sign-in with that provider. You can try again, or book as a guest.',
      OAuthCreateAccount: 'We could not create your account. You can still book as a guest.',
      OAuthAccountNotLinked: 'This email is already registered with a different sign-in method. Please use the method you signed up with.',
      Callback: 'We could not complete sign-in with that provider. You can try again, or book as a guest.',
    },
  },
  th: {
    heading: 'เข้าสู่ระบบไม่สำเร็จ',
    tryAgain: 'กลับไปหน้าเข้าสู่ระบบ',
    home: 'กลับหน้าแรก',
    fallback: 'เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบ กรุณาลองใหม่ หรือจองแบบผู้ใช้ทั่วไปได้เลย ไม่ต้องสมัครสมาชิก',
    messages: {
      AccessDenied: 'การเข้าสู่ระบบถูกยกเลิกหรือไม่ได้รับอนุญาต กรุณาลองใหม่ หรือจองแบบผู้ใช้ทั่วไป ไม่ต้องสมัครสมาชิก',
      Configuration: 'ระบบเข้าสู่ระบบขัดข้องชั่วคราว คุณยังจองแบบผู้ใช้ทั่วไปได้ ไม่ต้องสมัครสมาชิก',
      Verification: 'ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว',
      OAuthSignin: 'ไม่สามารถเชื่อมต่อผู้ให้บริการเข้าสู่ระบบได้ กรุณาลองใหม่ หรือจองแบบผู้ใช้ทั่วไป',
      OAuthCallback: 'ไม่สามารถเข้าสู่ระบบด้วยผู้ให้บริการนี้ได้ กรุณาลองใหม่ หรือจองแบบผู้ใช้ทั่วไป',
      OAuthCreateAccount: 'ไม่สามารถสร้างบัญชีได้ คุณยังจองแบบผู้ใช้ทั่วไปได้',
      OAuthAccountNotLinked: 'อีเมลนี้ลงทะเบียนไว้กับวิธีเข้าสู่ระบบอื่นแล้ว กรุณาใช้วิธีที่เคยสมัครไว้',
      Callback: 'ไม่สามารถเข้าสู่ระบบด้วยผู้ให้บริการนี้ได้ กรุณาลองใหม่ หรือจองแบบผู้ใช้ทั่วไป',
    },
  },
  ja: {
    heading: 'ログインが完了しませんでした',
    tryAgain: 'ログイン画面に戻る',
    home: 'ホームに戻る',
    fallback: 'ログイン中に問題が発生しました。もう一度お試しいただくか、アカウントなしでゲスト予約もご利用いただけます。',
    messages: {
      AccessDenied: 'ログインがキャンセルされたか、許可されませんでした。もう一度お試しいただくか、アカウントなしでゲスト予約をご利用ください。',
      Configuration: 'ログインは一時的にご利用いただけません。アカウントなしのゲスト予約はご利用いただけます。',
      Verification: 'このログインリンクは有効期限が切れているか、すでに使用されています。',
      OAuthSignin: 'ログインプロバイダーに接続できませんでした。もう一度お試しいただくか、ゲスト予約をご利用ください。',
      OAuthCallback: 'このプロバイダーでのログインを完了できませんでした。もう一度お試しいただくか、ゲスト予約をご利用ください。',
      OAuthCreateAccount: 'アカウントを作成できませんでした。ゲスト予約はご利用いただけます。',
      OAuthAccountNotLinked: 'このメールアドレスは別のログイン方法で登録済みです。登録時の方法をご利用ください。',
      Callback: 'このプロバイダーでのログインを完了できませんでした。もう一度お試しいただくか、ゲスト予約をご利用ください。',
    },
  },
  ko: {
    heading: '로그인이 완료되지 않았습니다',
    tryAgain: '로그인 화면으로 돌아가기',
    home: '홈으로 돌아가기',
    fallback: '로그인 중 문제가 발생했습니다. 다시 시도하시거나, 계정 없이 게스트로 예약하실 수 있습니다.',
    messages: {
      AccessDenied: '로그인이 취소되었거나 허용되지 않았습니다. 다시 시도하시거나 계정 없이 게스트로 예약해 주세요.',
      Configuration: '로그인을 일시적으로 사용할 수 없습니다. 계정 없이 게스트로 예약하실 수 있습니다.',
      Verification: '로그인 링크가 만료되었거나 이미 사용되었습니다.',
      OAuthSignin: '로그인 제공업체에 연결할 수 없습니다. 다시 시도하시거나 게스트로 예약해 주세요.',
      OAuthCallback: '해당 제공업체로 로그인을 완료할 수 없습니다. 다시 시도하시거나 게스트로 예약해 주세요.',
      OAuthCreateAccount: '계정을 생성할 수 없습니다. 게스트로는 예약하실 수 있습니다.',
      OAuthAccountNotLinked: '이 이메일은 다른 로그인 방식으로 이미 가입되어 있습니다. 가입할 때 사용한 방식을 이용해 주세요.',
      Callback: '해당 제공업체로 로그인을 완료할 수 없습니다. 다시 시도하시거나 게스트로 예약해 주세요.',
    },
  },
  zh: {
    heading: '登录未完成',
    tryAgain: '返回登录',
    home: '返回首页',
    fallback: '登录时出现问题。您可以重试，或以访客身份预订，无需注册账户。',
    messages: {
      AccessDenied: '登录已取消或未获授权。您可以重试，或以访客身份预订，无需注册账户。',
      Configuration: '登录服务暂时不可用。您仍可以访客身份预订，无需注册账户。',
      Verification: '该登录链接已过期或已被使用。',
      OAuthSignin: '无法连接该登录服务商。您可以重试，或以访客身份预订。',
      OAuthCallback: '无法通过该服务商完成登录。您可以重试，或以访客身份预订。',
      OAuthCreateAccount: '无法创建账户。您仍可以访客身份预订。',
      OAuthAccountNotLinked: '该邮箱已使用其他登录方式注册，请使用注册时的方式登录。',
      Callback: '无法通过该服务商完成登录。您可以重试，或以访客身份预订。',
    },
  },
};

function readLocaleCookie(): Locale {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const value = match?.[1];
  return LOCALES.includes(value as Locale) ? (value as Locale) : 'en';
}

export default function ErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams?.get('error') || '';
  const callbackUrl = searchParams?.get('callbackUrl') || '';

  // Read on mount rather than during render so SSR and hydration agree.
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    setLocale(readLocaleCookie());
  }, []);

  const copy = COPY[locale];
  const message = COPY[locale].messages[error] ?? copy.fallback;

  // Send them back to the real login page carrying the error code, so it can
  // lead with the guest option, and the callbackUrl so a customer who was
  // mid-booking returns to where they left off rather than to a blank form.
  const retryParams = new URLSearchParams();
  if (error) retryParams.set('error', error);
  if (callbackUrl) retryParams.set('callbackUrl', callbackUrl);
  const retryHref = `/auth/login${retryParams.toString() ? `?${retryParams}` : ''}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center">
          <div className="relative w-[180px] h-[60px] mb-8">
            <Image
              src="/images/logo_v1.png"
              alt="LENGOLF Logo"
              fill
              priority
              sizes="180px"
              className="object-contain"
            />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">{copy.heading}</h2>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>

        <div className="mt-8 space-y-4">
          <Link
            href={retryHref}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            {copy.tryAgain}
          </Link>
          <Link
            href="/"
            className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            {copy.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
