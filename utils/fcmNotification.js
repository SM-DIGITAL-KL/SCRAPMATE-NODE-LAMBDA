/**
 * FCM Notification Utility
 * Handles sending push notifications via Firebase Cloud Messaging
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK if not already initialized
let firebaseInitialized = false;

/**
 * Initialize Firebase Admin SDK
 * @param {Object} serviceAccount - Firebase service account credentials
 */
function initializeFirebase(serviceAccount = null) {
  if (firebaseInitialized) {
    console.log('✅ Firebase Admin already initialized');
    return;
  }

  try {
    // Check if Firebase is already initialized (from previous attempt)
    try {
      admin.app();
      firebaseInitialized = true;
      console.log('✅ Firebase Admin already initialized (existing app)');
      return;
    } catch (e) {
      // Not initialized yet, continue
    }

    if (serviceAccount) {
      // Initialize with provided service account
      console.log('🔧 Initializing Firebase with provided service account');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Initialize from environment variable (JSON string)
      console.log('🔧 Initializing Firebase from FIREBASE_SERVICE_ACCOUNT env var');
      try {
      const serviceAccountJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountJson)
      });
      } catch (parseError) {
        console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT JSON:', parseError);
        throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT JSON format');
      }
    } else {
      // Try to load service account files in priority order:
      // 1. Partner app (vendor app) - scrapmate-partner-android (new file)
      // 2. Partner app (vendor app) - scrapmate-partner-android (old file)
      // 3. Customer app - firebase-service-account.json
      
      const partnerServiceAccountPath = path.join(__dirname, '..', 'scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json');
      const partnerServiceAccountPathOld = path.join(__dirname, '..', 'scrapmate-partner-android-firebase-adminsdk-fbsvc-94a2c243ee.json');
      const customerServiceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
      
      // Try new partner app service account first (for vendor_app)
      if (fs.existsSync(partnerServiceAccountPath)) {
        console.log('🔧 Initializing Firebase from scrapmate-partner-android service account file (new)');
        try {
          const serviceAccountJson = JSON.parse(fs.readFileSync(partnerServiceAccountPath, 'utf8'));
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccountJson)
          });
          firebaseInitialized = true;
          const app = admin.app();
          console.log('✅ Firebase Admin SDK initialized successfully from partner app service account');
          console.log(`   Project ID: ${app.options.projectId || 'N/A'}`);
          console.log(`   Project: scrapmate-partner-android (vendor app)`);
          return;
        } catch (fileError) {
          console.error('❌ Error reading partner app service account file:', fileError);
          // Continue to try old partner app service account
        }
      }
      
      // Try old partner app service account (fallback)
      if (fs.existsSync(partnerServiceAccountPathOld)) {
        console.log('🔧 Initializing Firebase from scrapmate-partner-android service account file (old)');
        try {
          const serviceAccountJson = JSON.parse(fs.readFileSync(partnerServiceAccountPathOld, 'utf8'));
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccountJson)
          });
          firebaseInitialized = true;
          const app = admin.app();
          console.log('✅ Firebase Admin SDK initialized successfully from partner app service account (old)');
          console.log(`   Project ID: ${app.options.projectId || 'N/A'}`);
          console.log(`   Project: scrapmate-partner-android (vendor app)`);
          return;
        } catch (fileError) {
          console.error('❌ Error reading old partner app service account file:', fileError);
          // Continue to try customer app service account
        }
      }
      
      // Try customer app service account (for customer_app)
      if (fs.existsSync(customerServiceAccountPath)) {
        console.log('🔧 Initializing Firebase from firebase-service-account.json file (customer app)');
        try {
          const serviceAccountJson = JSON.parse(fs.readFileSync(customerServiceAccountPath, 'utf8'));
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccountJson)
          });
          firebaseInitialized = true;
          const app = admin.app();
          console.log('✅ Firebase Admin SDK initialized successfully from customer app service account');
          console.log(`   Project ID: ${app.options.projectId || 'N/A'}`);
          console.log(`   Project: scrapmate-user (customer app)`);
          return;
        } catch (fileError) {
          console.error('❌ Error reading customer app service account file:', fileError);
          // Continue to try other methods
        }
      }
      
      // Fallback to project ID only
      // Use project ID (default to scrapmate-user if not set)
      const projectId = process.env.FIREBASE_PROJECT_ID || 'scrapmate-user';
      console.log(`🔧 Initializing Firebase with project ID: ${projectId}`);
      
      // For Lambda/serverless environments, we need service account credentials
      // Project ID alone is not sufficient - we need credentials
      console.warn('⚠️  No FIREBASE_SERVICE_ACCOUNT found. Attempting to initialize with project ID only...');
      console.warn('   Note: This may fail if proper IAM credentials are not configured.');
      
      try {
        // Try to initialize with project ID
        // This will work if:
        // 1. Running on GCP with Application Default Credentials (ADC)
        // 2. Running on AWS Lambda with proper IAM role (requires service account)
        admin.initializeApp({
          projectId: projectId
        });
        console.log('✅ Firebase initialized with project ID (using default credentials)');
      } catch (initError) {
        console.error('❌ Firebase initialization failed:', initError.message);
        console.error('   This usually means:');
        console.error('   1. FIREBASE_SERVICE_ACCOUNT environment variable is not set, OR');
        console.error('   2. Application Default Credentials (ADC) are not configured, OR');
        console.error('   3. IAM role does not have Firebase permissions');
        console.error('');
        console.error('   To fix this, set FIREBASE_SERVICE_ACCOUNT environment variable:');
        console.error('   export FIREBASE_SERVICE_ACCOUNT=\'{"type":"service_account","project_id":"scrapmate-user",...}\'');
        throw new Error(
          `Firebase Admin SDK initialization failed: ${initError.message}. ` +
          `Please set FIREBASE_SERVICE_ACCOUNT environment variable with your Firebase service account JSON.`
        );
      }
    }

    firebaseInitialized = true;
    const app = admin.app();
    console.log('✅ Firebase Admin SDK initialized successfully');
    console.log(`   Project ID: ${app.options.projectId || 'N/A'}`);
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin SDK:', error);
    console.error('   Please ensure one of the following is set:');
    console.error('   1. FIREBASE_SERVICE_ACCOUNT (JSON string)');
    console.error('   2. FIREBASE_PROJECT_ID (with IAM role permissions)');
    console.error('   3. Google Application Default Credentials (ADC)');
    throw error;
  }
}

/**
 * Send FCM notification to a single device
 * @param {string} fcmToken - FCM token of the device
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload (optional)
 * @returns {Promise<Object>} - FCM send response
 */
async function sendNotification(fcmToken, title, body, data = {}) {
  try {
    // Initialize Firebase if not already done
    if (!firebaseInitialized) {
      try {
      initializeFirebase();
      } catch (initError) {
        console.error('❌ Failed to initialize Firebase:', initError.message);
        throw new Error(
          `Firebase initialization failed: ${initError.message}. ` +
          `Please set FIREBASE_SERVICE_ACCOUNT environment variable. ` +
          `See FIREBASE_SETUP_FIX.md for instructions.`
        );
      }
    }

    if (!fcmToken) {
      throw new Error('FCM token is required');
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {})
      },
      token: fcmToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    console.log('📤 Sending FCM notification:', {
      token: fcmToken.substring(0, 20) + '...',
      title,
      body
    });

    const response = await admin.messaging().send(message);
    console.log('✅ FCM notification sent successfully:', response);

    return {
      success: true,
      messageId: response,
      token: fcmToken
    };
  } catch (error) {
    console.error('❌ Error sending FCM notification:', error);
    
    // Handle specific FCM errors
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      console.warn('⚠️ Invalid or unregistered FCM token');
      return {
        success: false,
        error: 'invalid_token',
        message: 'FCM token is invalid or unregistered'
      };
    }

    throw error;
  }
}

/**
 * Send FCM notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload (optional)
 * @returns {Promise<Object>} - FCM batch send response
 */
async function sendMulticastNotification(fcmTokens, title, body, data = {}) {
  try {
    // Initialize Firebase if not already done
    if (!firebaseInitialized) {
      try {
      initializeFirebase();
      } catch (initError) {
        console.error('❌ Failed to initialize Firebase:', initError.message);
        throw new Error(
          `Firebase initialization failed: ${initError.message}. ` +
          `Please set FIREBASE_SERVICE_ACCOUNT environment variable. ` +
          `See FIREBASE_SETUP_FIX.md for instructions.`
        );
      }
    }

    if (!fcmTokens || fcmTokens.length === 0) {
      throw new Error('FCM tokens array is required');
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {})
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    console.log('📤 Sending FCM multicast notification:', {
      tokenCount: fcmTokens.length,
      title,
      body
    });

    const response = await admin.messaging().sendEachForMulticast({
      tokens: fcmTokens,
      ...message
    });

    console.log('✅ FCM multicast notification sent:', {
      successCount: response.successCount,
      failureCount: response.failureCount
    });

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    };
  } catch (error) {
    console.error('❌ Error sending FCM multicast notification:', error);
    throw error;
  }
}

/**
 * Send FCM notification to a topic
 * @param {string} topic - Topic name
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload (optional)
 * @returns {Promise<Object>} - FCM send response
 */
async function sendTopicNotification(topic, title, body, data = {}) {
  try {
    // Initialize Firebase if not already done
    if (!firebaseInitialized) {
      try {
      initializeFirebase();
      } catch (initError) {
        console.error('❌ Failed to initialize Firebase:', initError.message);
        throw new Error(
          `Firebase initialization failed: ${initError.message}. ` +
          `Please set FIREBASE_SERVICE_ACCOUNT environment variable. ` +
          `See FIREBASE_SETUP_FIX.md for instructions.`
        );
      }
    }

    if (!topic) {
      throw new Error('Topic is required');
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      data: {
        ...data,
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {})
      },
      topic: topic,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    console.log('📤 Sending FCM topic notification:', {
      topic,
      title,
      body
    });

    const response = await admin.messaging().send(message);
    console.log('✅ FCM topic notification sent successfully:', response);

    return {
      success: true,
      messageId: response,
      topic: topic
    };
  } catch (error) {
    console.error('❌ Error sending FCM topic notification:', error);
    throw error;
  }
}

/**
 * Send FCM notification to vendor app (uses vendor app channel ID)
 * @param {string} fcmToken - FCM token of the vendor device
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload (optional)
 * @returns {Promise<Object>} - FCM send response
 */
async function sendVendorNotification(fcmToken, title, body, data = {}) {
  try {
    // Initialize Firebase if not already done (will use vendor app service account)
    if (!firebaseInitialized) {
      try {
        initializeFirebase();
      } catch (initError) {
        console.error('❌ Failed to initialize Firebase:', initError.message);
        throw new Error(
          `Firebase initialization failed: ${initError.message}. ` +
          `Please set FIREBASE_SERVICE_ACCOUNT environment variable. ` +
          `See FIREBASE_SETUP_FIX.md for instructions.`
        );
      }
    }

    if (!fcmToken) {
      throw new Error('FCM token is required');
    }

    // Build data payload with all values as strings (FCM requirement)
    const dataPayload = {
      ...data,
      ...Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {})
    };

    const message = {
      // notification field ensures notification shows in system tray when app is in background/closed
      notification: {
        title: title,
        body: body
      },
      // data field allows app to handle notification data when opened
      data: dataPayload,
      token: fcmToken,
      android: {
        // 'high' priority ensures notification shows even when device is in Doze mode
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'scrapmate_partner_notifications', // Vendor app channel ID
          // Click action - when user taps notification, app opens with this data
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            // Enable background fetch so notification is received even when app is closed
            contentAvailable: true,
            alert: {
              title: title,
              body: body
            }
          }
        }
      }
    };

    console.log('📤 Sending FCM notification to vendor:', {
      token: fcmToken.substring(0, 20) + '...',
      title,
      body,
      channelId: 'scrapmate_partner_notifications'
    });

    const response = await admin.messaging().send(message);
    console.log('✅ FCM notification sent successfully to vendor:', response);

    return {
      success: true,
      messageId: response,
      token: fcmToken
    };
  } catch (error) {
    console.error('❌ Error sending FCM notification to vendor:', error);
    
    // Handle specific FCM errors
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      console.warn('⚠️ Invalid or unregistered FCM token');
      return {
        success: false,
        error: 'invalid_token',
        message: 'FCM token is invalid or unregistered'
      };
    }

    throw error;
  }
}

/**
 * Send FCM notification to customer app (uses customer app Firebase service account)
 * @param {string} fcmToken - FCM token of the customer device
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload (optional)
 * @returns {Promise<Object>} - FCM send response
 */
async function sendCustomerNotification(fcmToken, title, body, data = {}) {
  try {
    // Initialize Firebase with customer app service account
    // Try to load customer app service account file
    const customerServiceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
    
    let customerApp = null;
    
    // Check if customer app is already initialized
    try {
      customerApp = admin.app('customer-app');
      console.log('✅ Customer app Firebase already initialized');
    } catch (e) {
      // Not initialized yet, initialize it
      if (fs.existsSync(customerServiceAccountPath)) {
        console.log('🔧 Initializing Firebase for customer app from service account file');
        const serviceAccountJson = JSON.parse(fs.readFileSync(customerServiceAccountPath, 'utf8'));
        customerApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccountJson)
        }, 'customer-app');
        console.log('✅ Firebase Admin SDK initialized for customer app');
        console.log(`   Project ID: ${customerApp.options.projectId || 'N/A'}`);
        console.log(`   Project: scrapmate-customer (customer app)`);
      } else {
        // Fallback to default app if customer service account not found
        console.warn('⚠️ Customer app service account not found, using default Firebase app');
        if (!firebaseInitialized) {
          initializeFirebase();
        }
        customerApp = admin.app();
      }
    }

    if (!fcmToken) {
      throw new Error('FCM token is required');
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {})
      },
      token: fcmToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default' // Customer app channel ID
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    console.log('📤 Sending FCM notification to customer:', {
      token: fcmToken.substring(0, 20) + '...',
      title,
      body
    });

    const response = await customerApp.messaging().send(message);
    console.log('✅ FCM notification sent successfully to customer:', response);

    return {
      success: true,
      messageId: response,
      token: fcmToken
    };
  } catch (error) {
    console.error('❌ Error sending FCM notification to customer:', error);
    
    // Handle specific FCM errors
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      console.warn('⚠️ Invalid or unregistered FCM token');
      return {
        success: false,
        error: 'invalid_token',
        message: 'FCM token is invalid or unregistered'
      };
    }

    throw error;
  }
}

module.exports = {
  initializeFirebase,
  sendNotification,
  sendVendorNotification,
  sendCustomerNotification,
  sendMulticastNotification,
  sendTopicNotification
};

