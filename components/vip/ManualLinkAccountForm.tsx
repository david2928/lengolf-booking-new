'use client';

import React, { useState } from 'react';
import { useForm, ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { linkAccount } from '../../lib/vipService';
import { VipApiError } from '../../types/vip';
import { useVipContext } from '@/app/[locale]/(features)/vip/contexts/VipContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Phone, CheckCircle, AlertCircle } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

// Messages reference translation keys; UI translates at render time
const formSchema = z.object({
  phoneNumber: z.string()
    .min(1, { message: "validationRequired" })
    .refine((value) => isValidPhoneNumber(value || ''), {
      message: "validationInvalid"
    }),
});

interface ManualLinkAccountFormProps {
  userName?: string | null;
}

const ManualLinkAccountForm: React.FC<ManualLinkAccountFormProps> = ({ userName }) => {
  const t = useTranslations('vip.linkAccount');
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  const [modalMessage, setModalMessage] = useState('');
  const { refetchVipStatus } = useVipContext();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phoneNumber: '',
    },
  });

  const handleModalClose = () => {
    setShowModal(false);
    // Modal close will navigate since router.push was already called
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const result = await linkAccount({ phoneNumber: values.phoneNumber });
      const successMessage = result.message || t('defaultSuccess');

      // Show success modal first
      setModalType('success');
      setModalMessage(successMessage);
      setShowModal(true);

      // Start background tasks immediately for better UX
      // Update VIP status in background
      if (refetchVipStatus) {
        refetchVipStatus().catch(console.error);
      }

      // Start navigation immediately after a short delay for modal to show
      setTimeout(() => {
        router.push('/vip');
      }, 1500); // 1.5 second delay to let user see success modal

    } catch (e: unknown) {
      console.error('Link account error:', e);
      let errorMessage = t('unexpectedError');
      if (e instanceof VipApiError) {
        errorMessage = e.payload?.error || e.payload?.message || e.message;
      } else if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      } else if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
        errorMessage = e.message;
      }
      // Customize error messages for better UX
      if (errorMessage.includes('No matching customer account found')) {
        errorMessage = t('noMatchingAccount');
      }

      // Show error modal
      setModalType('error');
      setModalMessage(errorMessage || t('defaultError'));
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Phone className="w-6 h-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            {t('cardTitle')}
          </CardTitle>
          <CardDescription className="text-gray-600">
            {userName ? t('cardDescriptionWithName', { name: userName }) : t('cardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field, fieldState }: { field: ControllerRenderProps<z.infer<typeof formSchema>, 'phoneNumber'>; fieldState: { error?: { message?: string } } }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">{t('phoneNumber')}</FormLabel>
                    <FormControl>
                      <PhoneInput
                        international
                        defaultCountry="TH"
                        placeholder={t('phonePlaceholder')}
                        value={field.value}
                        onChange={field.onChange}
                        className={`w-full h-12 px-3 py-2 rounded-lg bg-gray-50 focus:outline-none border focus:border-green-500 focus:ring-1 focus:ring-green-500 custom-phone-input ${
                          form.formState.errors.phoneNumber
                            ? 'border-red-500'
                            : (field.value && isValidPhoneNumber(field.value || ''))
                            ? 'border-green-500'
                            : 'border-gray-200'
                        }`}
                      />
                    </FormControl>
                    {fieldState.error?.message && (
                      <p className="text-[0.8rem] font-medium text-destructive">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {t(fieldState.error.message as any)}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full h-12 bg-green-600 hover:bg-green-700" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? t('connecting') : t('connectAccount')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <h3 className="font-medium text-blue-900">{t('needHelp')}</h3>
            <p className="text-sm text-blue-700">
              {t('helpBody')}
            </p>
            <p className="text-xs text-blue-600">
              {t('helpSupport')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Success/Error Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4">
              {modalType === 'success' ? (
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              ) : (
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              )}
            </div>
            <DialogTitle className="text-center">
              {modalType === 'success' ? t('modalSuccessTitle') : t('modalErrorTitle')}
            </DialogTitle>
            <DialogDescription className="text-center">
              {modalMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={handleModalClose} className={modalType === 'success' ? 'bg-green-600 hover:bg-green-700' : ''}>
              {modalType === 'success' ? t('modalSuccessCta') : t('modalErrorCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManualLinkAccountForm; 