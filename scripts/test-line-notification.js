#!/usr/bin/env node

/**
 * Script to test sending a LINE notification directly
 * 
 * Usage:
 *   node scripts/test-line-notification.js
 */

const fetch = require('node-fetch');

// Configuration
const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';
const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN'; // Replace with actual token

// Test recipient
const TEST_USER_ID = 'Uf4177a1781df7fd215e6d2749fd00296';
const TEST_NAME = 'Test User';
const REVIEW_URL = 'https://g.page/r/CXwvpW56UsBgEAE/review';
const VOUCHER_IMAGE_URL = 'https://www.len.golf/wp-content/uploads/2024/06/Logo.png';

async function sendTestLineMessage() {
  console.log(`Sending test LINE message to ${TEST_USER_ID}...`);
  
  try {
    // Build LINE message
    const message = {
      to: TEST_USER_ID,
      messages: [
        {
          type: 'text',
          text: `Thank you for visiting LENGOLF, ${TEST_NAME}! We hope you enjoyed your golf session. 🏌️‍♂️`
        },
        {
          type: 'text',
          text: 'Your feedback is important to us! Please consider leaving us a Google review and receive a special thank you offer: 1 FREE HOUR + 1 FREE SOFT DRINK on your next visit!'
        },
        {
          type: 'template',
          altText: 'Leave a Google Review for LENGOLF - Get 1 FREE HOUR + FREE DRINK',
          template: {
            type: 'buttons',
            thumbnailImageUrl: VOUCHER_IMAGE_URL,
            imageAspectRatio: 'rectangle',
            imageSize: 'cover',
            title: 'LENGOLF Special Offer',
            text: '1 FREE HOUR + FREE DRINK on your next visit!',
            actions: [
              {
                type: 'uri',
                label: 'Write a Review',
                uri: REVIEW_URL
              }
            ]
          }
        },
        {
          type: 'text',
          text: 'To redeem your offer, please show both your Google review and this LINE message during your next visit. Thank you!'
        }
      ]
    };

    // Send LINE message
    const response = await fetch(LINE_MESSAGING_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LINE API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const responseData = await response.json();
    
    console.log('✅ LINE message sent successfully!');
    console.log('Response:', responseData);
    
    return responseData;
  } catch (error) {
    console.error('Error sending LINE message:', error);
    throw error;
  }
}

// Execute the function
sendTestLineMessage()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 