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

const profileFormSchema = z.object({
  display_name: z.string().min(2, { message: "Name must be at least 2 characters." }).max(100).optional(),
  email: z.string().email({ message: "Invalid email address." }).optional(),
  vip_phone_number: z.string().optional().refine((val: string | undefined) => !val || /^\+?[0-9\s-()]{7,}$/.test(val), { // Allow empty or valid phone
    message: "Invalid phone number format.",
  }),
  marketingPreference: z.boolean().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const ProfileView = () => {
  const [profile, setProfile] = useState<VipProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { refetchVipStatus, session } = useVipContext();


  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      display_name: '',
      email: '',
      vip_phone_number: '',
      marketingPreference: true,
    },
  });
  
  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getVipProfile();
      setProfile(data);
      form.reset({
        display_name: data.name || '',
        email: data.email || '',
        vip_phone_number: (data.vipTier ? data.phoneNumber : '') || undefined,
        marketingPreference: data.marketingPreference ?? true,
      });
    } catch (err) {
      console.error("Failed to fetch profile", err);
      const typedError = err as VipApiError; // Use VipApiError type
      setError(typedError.payload?.message || typedError.message || 'Could not load profile data.');
    } finally {
      setIsLoading(false);
    }
  }, [form]);

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
    if (values.vip_phone_number !== undefined && values.vip_phone_number !== ((profile?.vipTier ? profile.phoneNumber : '') || undefined)) {
        payload.vip_phone_number = values.vip_phone_number === '' ? null : values.vip_phone_number; // Send null if cleared
    }
    if (values.marketingPreference !== undefined && values.marketingPreference !== profile?.marketingPreference) {
        payload.marketingPreference = values.marketingPreference;
    }

    if (Object.keys(payload).length === 0) {
      setSubmitStatus({ type: 'success', message: 'No changes to save.'});
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await updateVipProfile(payload);
      setSubmitStatus({ type: 'success', message: response.message || 'Profile updated successfully!' });
      await fetchProfile(); // Re-fetch to show updated data
      if(refetchVipStatus) await refetchVipStatus(); 
    } catch (err) {
      const typedError = err as VipApiError; // Use VipApiError type
      setSubmitStatus({ type: 'error', message: typedError.payload?.message || typedError.message || 'Failed to update profile.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading profile...</span></div>;
  }

  if (error) {
    return <div className="text-center py-10 text-destructive"><AlertTriangle className="inline-block mr-2"/>{error} <Button onClick={fetchProfile} variant="outline" className="ml-2">Try Again</Button></div>;
  }

  if (!profile) {
    return <div className="text-center py-10">No profile data found.</div>;
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">My Profile</CardTitle>
        <CardDescription>View and update your personal information and preferences. Your VIP Tier is: <strong>{profile.vipTier?.name || 'Not Assigned'}</strong>.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }: { field: ControllerRenderProps<ProfileFormValues, 'display_name'> }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl><Input placeholder="Your display name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }: { field: ControllerRenderProps<ProfileFormValues, 'email'> }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl><Input type="email" placeholder="your@email.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div>
                <FormLabel>Registered Phone Number (from CRM/Primary)</FormLabel>
                <Input value={profile.phoneNumber || 'Not provided'} readOnly disabled className="mt-1 bg-muted/50"/>
                <FormDescription className="mt-1">
                    This phone number is for reference. To change it, please contact support.
                </FormDescription>
            </div>

            <FormField
              control={form.control}
              name="vip_phone_number"
              render={({ field }: { field: ControllerRenderProps<ProfileFormValues, 'vip_phone_number'> }) => (
                <FormItem>
                  <FormLabel>Alternative VIP Contact Phone (Optional)</FormLabel>
                  <FormControl><Input placeholder="Set or update VIP contact phone" {...field} value={field.value || ''} /></FormControl>
                   <FormDescription>
                    This number is stored in your VIP profile and can be edited here.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                    <FormLabel>Marketing Preferences</FormLabel>
                    <FormDescription>
                      Receive emails about new promotions, events, and updates.
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default ProfileView; 