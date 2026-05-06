import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Razorpay credentials not configured' },
        { status: 500 }
      );
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: 9900, // ₹99 in paise
      currency: 'INR',
      receipt: `cv-tailor-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create order' },
      { status: 500 }
    );
  }
}
