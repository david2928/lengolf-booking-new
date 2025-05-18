'use client';

import React, { useState } from 'react';
import { useForm, ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Assuming input.tsx (lowercase) - WILL NEED VERIFICATION & INSTALLATION
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'; // Assuming form.tsx (lowercase) - WILL NEED VERIFICATION & INSTALLATION
import { linkAccount } from '../../lib/vipService'; // VipApiError removed
import { VipApiError } from '../../types/vip'; // VipApiError imported here
import { useVipContext } from '../../app/(features)/vip/contexts/VipContext'; // Corrected path
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const phoneRegex = new RegExp(
  /^([+]?[\s0-9]+)?(\d{3}|[(]?[0-9]+[)])?([-]?[\s]?[0-9])+$/
);

const formSchema = z.object({
  phoneNumber: z.string()
    .min(8, { message: "Phone number must be at least 8 digits." })
    .regex(phoneRegex, 'Invalid phone number format.'),
});

interface ManualLinkAccountFormProps {
  userName?: string | null; // To display "Welcome, [User Name]"
}

const ManualLinkAccountForm: React.FC<ManualLinkAccountFormProps> = ({ userName }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);
  const { refetchVipStatus } = useVipContext();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phoneNumber: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setApiError(null);
    setApiSuccess(null);
    try {
      const result = await linkAccount({ phoneNumber: values.phoneNumber });
      setApiSuccess(result.message || 'Account linked successfully! Redirecting...');
      if (refetchVipStatus) {
        await refetchVipStatus();
      }
      // Redirect to dashboard after a short delay to show success message
      setTimeout(() => {
        router.push('/vip/dashboard'); 
      }, 1500);
    } catch (e: any) {
      console.error('Link account error:', e);
      let errorMessage = 'An unexpected error occurred.';
      if (e instanceof VipApiError) {
        errorMessage = e.payload?.error || e.payload?.message || e.message;
      } else if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      } else if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
        errorMessage = e.message;
      }
      setApiError(errorMessage || 'Failed to link account.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Link Your CRM Account</CardTitle>
        {userName && <CardDescription>Hello {userName}! Enter your phone number to find and link your Lengolf membership profile.</CardDescription>}
        {!userName && <CardDescription>Enter your phone number to find and link your Lengolf membership profile.</CardDescription>}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }: { field: ControllerRenderProps<z.infer<typeof formSchema>, 'phoneNumber'> }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 0812345678" {...field} />
                  </FormControl>
                  <FormDescription>
                    The phone number associated with your Lengolf membership.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {apiError && <p className="text-sm font-medium text-destructive">{apiError}</p>}
            {apiSuccess && <p className="text-sm font-medium text-green-600">{apiSuccess}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Linking...' : 'Link Account'}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
            If you encounter issues, please contact support.
        </p>
      </CardFooter>
    </Card>
  );
};

export default ManualLinkAccountForm; 