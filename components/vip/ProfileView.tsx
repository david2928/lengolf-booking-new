'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useForm, ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox'; // Assuming checkbox.tsx
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { getVipProfile, updateVipProfile } from '../../lib/vipService'; // VipApiError removed
import { VipProfileResponse, UpdateVipProfileRequest, VipApiError } from '../../types/vip'; // VipApiError imported here
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useVipContext } from '../../app/(features)/vip/contexts/VipContext'; // Corrected path
import { useTranslations } from 'next-intl';

// Move schema creation inside component to access translations
const createProfileFormSchema = (tVip: any) => z.object({
  display_name: z.string().min(2, { message: tVip('nameMinLength') }).max(100).optional(),
  email: z.string().email({ message: tVip('invalidEmail') }).optional(),
  marketingPreference: z.boolean().optional(),
});

type ProfileFormValues = z.infer<ReturnType<typeof createProfileFormSchema>>;

const ProfileView = () => {
  const { vipStatus, sharedData, updateSharedData, isSharedDataFresh } = useVipContext();
  const tVip = useTranslations('vip');
  const [profile, setProfile] = useState<VipProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { refetchVipStatus, session } = useVipContext();


  const profileFormSchema = createProfileFormSchema(tVip);
  
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      display_name: '',
      email: '',
      marketingPreference: true,
    },
  });
  
  const fetchProfile = useCallback(async (forceRefresh = false) => {
    // Use shared data if available and fresh, unless forcing refresh
    if (!forceRefresh && isSharedDataFresh() && sharedData.profile) {
      const data = sharedData.profile;
      setProfile(data);
      form.reset({
        display_name: data.name || '',
        email: data.email || '',
        marketingPreference: data.marketingPreference ?? true,
      });
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await getVipProfile();
      setProfile(data);
      
      // Update shared data context
      updateSharedData({ profile: data });
      
      form.reset({
        display_name: data.name || '',
        email: data.email || '',
        marketingPreference: data.marketingPreference ?? true,
      });
    } catch (err) {
      console.error("Failed to fetch profile", err);
      const typedError = err as VipApiError; // Use VipApiError type
      setError(typedError.payload?.message || typedError.message || tVip('couldNotLoadProfile'));
    } finally {
      setIsLoading(false);
    }
  }, [form, isSharedDataFresh, sharedData.profile, sharedData.lastDataFetch, updateSharedData]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  async function onSubmit(values: ProfileFormValues) {
    setIsSubmitting(true);
    setSubmitStatus(null);

    const payload: UpdateVipProfileRequest = {};
    // Only add to payload if the value is actually provided in the form and different or new
    if (values.display_name && values.display_name !== profile?.name) payload.display_name = values.display_name;
    if (values.email && values.email !== profile?.email) payload.email = values.email;
    if (values.marketingPreference !== undefined && values.marketingPreference !== profile?.marketingPreference) {
        payload.marketingPreference = values.marketingPreference;
    }

    if (Object.keys(payload).length === 0) {
      setSubmitStatus({ type: 'success', message: tVip('noChangesToSave')});
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await updateVipProfile(payload);
      setSubmitStatus({ type: 'success', message: response.message || tVip('profileUpdatedSuccess') });
      await fetchProfile(true); // Force refresh to show updated data and update shared context
      if(refetchVipStatus) await refetchVipStatus(); 
    } catch (err) {
      const typedError = err as VipApiError; // Use VipApiError type
      setSubmitStatus({ type: 'error', message: typedError.payload?.message || typedError.message || tVip('failedToUpdateProfile') });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">{tVip('loadingProfile')}</span></div>;
  }

  if (error) {
    return <div className="text-center py-10 text-destructive"><AlertTriangle className="inline-block mr-2"/>{error} <Button onClick={() => fetchProfile(true)} variant="outline" className="ml-2">{tVip('tryAgain')}</Button></div>;
  }

  if (!profile) {
    return <div className="text-center py-10">{tVip('noProfileData')}</div>;
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">{tVip('myProfile')}</CardTitle>
        <CardDescription>{tVip('profileDescription')}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }: { field: ControllerRenderProps<ProfileFormValues, 'display_name'> }) => (
                <FormItem>
                  <FormLabel>{tVip('displayName')}</FormLabel>
                  <FormControl><Input placeholder={tVip('displayNamePlaceholder')} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }: { field: ControllerRenderProps<ProfileFormValues, 'email'> }) => (
                <FormItem>
                  <FormLabel>{tVip('emailAddress')}</FormLabel>
                  <FormControl><Input type="email" placeholder={tVip('emailPlaceholder')} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div>
                <FormLabel>{tVip('phoneNumber')}</FormLabel>
                <Input value={profile.phoneNumber || tVip('notProvided')} readOnly disabled className="mt-1 bg-muted/50"/>
                <FormDescription className="mt-1 text-sm text-gray-600">
                    {tVip('phoneUpdateNote')}
                </FormDescription>
            </div>

            <FormField
              control={form.control}
              name="marketingPreference"
              render={({ field }: { field: ControllerRenderProps<ProfileFormValues, 'marketingPreference'> }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>{tVip('marketingPreferences')}</FormLabel>
                    <FormDescription>
                      {tVip('marketingDescription')}
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-4">
             {submitStatus && (
              <div className={`p-3 rounded-md w-full ${submitStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} flex items-center`}>
                {submitStatus.type === 'success' ? <CheckCircle className="mr-2 h-5 w-5"/> : <AlertTriangle className="mr-2 h-5 w-5"/>}
                {submitStatus.message}
              </div>
            )}
            <Button type="submit" disabled={isSubmitting || isLoading}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? tVip('saving') : tVip('saveChanges')}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default ProfileView; 