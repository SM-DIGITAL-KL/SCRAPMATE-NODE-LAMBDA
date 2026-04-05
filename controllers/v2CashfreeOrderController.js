/**
 * V2 Cashfree Payment Controller
 * Creates Cashfree orders and verifies payment status.
 */

const axios = require('axios');

const CASHFREE_API_VERSION = '2023-08-01';

const getCashfreeBaseUrl = () => {
  return 'https://api.cashfree.com';
};

const getCashfreeEnv = () => {
  return 'PRODUCTION';
};

const getCashfreeEnvSource = () => {
  return 'hardcoded-production';
};

const getCashfreeHeaders = () => {
  const env = getCashfreeEnv();
  const clientId = process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_PROD_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_PROD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Cashfree credentials are not configured');
  }

  if (getCashfreeEnv() === 'SANDBOX' && String(clientSecret).includes('_prod_')) {
    throw new Error('Sandbox mode is enabled but production Cashfree secret key is configured. Use sandbox keys.');
  }
  if (getCashfreeEnv() === 'PRODUCTION' && String(clientSecret).includes('_test_')) {
    throw new Error('Production mode is enabled but test Cashfree secret key is configured. Use production keys.');
  }

  return {
    'x-client-id': clientId,
    'x-client-secret': clientSecret,
    'x-api-version': CASHFREE_API_VERSION,
    'Content-Type': 'application/json',
  };
};

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

const normalizeError = (error, fallback) => {
  const fromAxios =
    error?.response?.data?.message ||
    error?.response?.data?.msg ||
    error?.response?.data?.error ||
    error?.response?.statusText;
  if (fromAxios) return String(fromAxios);
  if (error?.message) return String(error.message);
  return fallback;
};

exports.createOrder = async (req, res) => {
  try {
    const {
      order_amount,
      order_currency = 'INR',
      order_id,
      order_note,
      order_meta,
      customer_details = {},
      order_tags,
    } = req.body || {};

    const amount = Number(order_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid order_amount. Amount must be a positive number.',
        data: null,
      });
    }

    const customer_id = String(customer_details.customer_id || '').trim();
    const customer_name = String(customer_details.customer_name || '').trim();
    const customer_email = String(customer_details.customer_email || '').trim();
    const customer_phone = normalizePhone(customer_details.customer_phone);

    if (!customer_id || !customer_name || !customer_email || customer_phone.length < 10) {
      return res.status(400).json({
        status: 'error',
        msg: 'Missing required customer details: customer_id, customer_name, customer_email, customer_phone',
        data: null,
      });
    }

    const generatedOrderId = String(
      order_id ||
      `sm_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    );

    const payload = {
      order_id: generatedOrderId,
      order_amount: Number(amount.toFixed(2)),
      order_currency: String(order_currency || 'INR'),
      customer_details: {
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
      },
      order_note: order_note || 'Scrapmate subscription payment',
      order_meta: order_meta || {},
      order_tags: order_tags || {},
    };

    const baseUrl = getCashfreeBaseUrl();
    const headers = getCashfreeHeaders();

    console.log('💳 Creating Cashfree order:', {
      order_id: generatedOrderId,
      amount: payload.order_amount,
      currency: payload.order_currency,
      env: getCashfreeEnv(),
      envSource: getCashfreeEnvSource(),
    });

    const response = await axios.post(`${baseUrl}/pg/orders`, payload, {
      headers,
      timeout: 20000,
    });

    const data = response?.data || {};
    return res.json({
      status: 'success',
      msg: 'Cashfree order created successfully',
      data: {
        order_id: data.order_id || generatedOrderId,
        payment_session_id: data.payment_session_id || '',
        order_status: data.order_status || 'ACTIVE',
        cf_order_id: data.cf_order_id || null,
        environment: getCashfreeEnv(),
      },
    });
  } catch (error) {
    console.error('❌ Error creating Cashfree order:', error?.response?.data || error);
    return res.status(500).json({
      status: 'error',
      msg: normalizeError(error, 'Failed to create Cashfree order'),
      data: null,
    });
  }
};

exports.getOrderStatus = async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({
        status: 'error',
        msg: 'orderId is required',
        data: null,
      });
    }

    const baseUrl = getCashfreeBaseUrl();
    const headers = getCashfreeHeaders();

    const [orderResponse, paymentsResponse] = await Promise.all([
      axios.get(`${baseUrl}/pg/orders/${encodeURIComponent(orderId)}`, {
        headers,
        timeout: 20000,
      }),
      axios.get(`${baseUrl}/pg/orders/${encodeURIComponent(orderId)}/payments`, {
        headers,
        timeout: 20000,
      }).catch(() => ({ data: [] })),
    ]);

    const orderData = orderResponse?.data || {};
    const payments = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : [];
    const successfulPayment = payments.find((payment) => {
      const status = String(payment?.payment_status || '').toUpperCase();
      return status === 'SUCCESS';
    });

    return res.json({
      status: 'success',
      msg: 'Cashfree order fetched successfully',
      data: {
        order_id: orderData.order_id || orderId,
        order_status: orderData.order_status || '',
        payment_status: successfulPayment?.payment_status || null,
        cf_payment_id: successfulPayment?.cf_payment_id || null,
        cf_order_id: orderData.cf_order_id || null,
        payments,
        environment: getCashfreeEnv(),
      },
    });
  } catch (error) {
    console.error('❌ Error fetching Cashfree order:', error?.response?.data || error);
    return res.status(500).json({
      status: 'error',
      msg: normalizeError(error, 'Failed to fetch Cashfree order'),
      data: null,
    });
  }
};
