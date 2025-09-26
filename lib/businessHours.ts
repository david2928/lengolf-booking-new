/**
 * Business Hours Utility
 * Handles business hours logic for chat auto-replies
 */

export interface BusinessHours {
  isOpen: boolean;
  nextOpenTime?: string;
  responseMessage: string;
}

/**
 * Check if current time is within business hours (10 AM - 11 PM Bangkok time)
 */
export function getBusinessHoursStatus(): BusinessHours {
  // Get current time in Bangkok timezone
  const now = new Date();
  const bangkokTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const currentHour = bangkokTime.getHours();

  // Business hours: 10 AM to 11 PM (23:00)
  const isOpen = currentHour >= 10 && currentHour < 23;

  if (isOpen) {
    return {
      isOpen: true,
      responseMessage: "We usually reply within a few minutes during business hours (10 AM - 11 PM)."
    };
  } else {
    // Calculate next opening time
    const tomorrow = new Date(bangkokTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const nextOpen = currentHour < 10
      ? new Date(bangkokTime.setHours(10, 0, 0, 0))
      : tomorrow;

    return {
      isOpen: false,
      nextOpenTime: nextOpen.toLocaleTimeString("en-US", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short"
      }),
      responseMessage: "Thank you for your message! Please feel free to leave us a message and we'll get back to you as soon as possible. Our business hours are 10 AM - 11 PM Bangkok time."
    };
  }
}

/**
 * Get the appropriate header message for chat
 */
export function getChatHeaderMessage(): string {
  const status = getBusinessHoursStatus();

  if (status.isOpen) {
    return "We usually reply within a few minutes";
  } else {
    return `Business hours: 10 AM - 11 PM Bangkok time`;
  }
}