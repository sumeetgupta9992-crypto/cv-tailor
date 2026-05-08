import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error('[Razorpay] Missing credentials — KEY_ID present:', !!keyId, '| KEY_SECRET present:', !!keySecret);
      return NextResponse.json(
        { success: false, error: 'Razorpay credentials not configured on server' },
        { status: 500 }
      );
    }

    console.log('[Razorpay] Creating order with key_id:', keyId);

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const order = await razorpay.orders.create({
      amount: 9900, // ₹99 in paise
      currency: 'INR',
      receipt: `cv-tailor-${Date.now()}`,
    });

    console.log('[Razorpay] Order created:', order.id, '| status:', order.status);

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error) {
    console.error('[Razorpay] Order creation error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create order' },
      { status: 500 }
    );
  }
}
