const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const redis = require('../config/redis');
const bcrypt = require('bcryptjs');

const TABLE_NAME = 'users';

class User {
  // Create a new user
  static async create(name, email, mobNum, userType, password = null, appType = null, appVersion = 'v1') {
      try {
      const client = getDynamoDBClient();
        const hashedPassword = password ? await bcrypt.hash(password, 10) : await bcrypt.hash(mobNum, 10);
      
      // Generate ID (you might want to use a sequence or UUID)
      // For now, we'll use timestamp + random
      const id = Date.now() + Math.floor(Math.random() * 1000);
      
      const user = {
        id: id,
        name: name,
        email: email,
        mob_num: typeof mobNum === 'string' && !isNaN(mobNum) ? parseInt(mobNum) : mobNum,
        user_type: userType,
        password: hashedPassword,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_version: appVersion // Default to 'v1' for backward compatibility
      };
      
      // Add app_type if provided
      if (appType) {
        user.app_type = appType;
      }

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: user
      });

      await client.send(command);
          
          // Cache user in Redis
          try {
        await redis.set(`user:${id}`, JSON.stringify(user));
          } catch (redisErr) {
            console.error('Redis cache error:', redisErr);
          }

      // Remove password from returned user
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
      } catch (err) {
      throw err;
      }
  }

  // Find user by mobile number
  static async findByMobile(mobNum) {
    try {
      const client = getDynamoDBClient();
      const mobileValue = typeof mobNum === 'string' && !isNaN(mobNum) ? parseInt(mobNum) : mobNum;
      
      console.log(`🔍 findByMobile: Searching for mobile ${mobNum} (converted to: ${mobileValue}, type: ${typeof mobileValue})`);
      
      // Scan with pagination to find the matching mobile number
      // Note: Limit in ScanCommand limits items scanned, not filtered results
      let lastKey = null;
      let scanCount = 0;
      const allMatchingUsers = [];
      
      do {
        scanCount++;
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':mobile': mobileValue,
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
          console.log(`   Continuing scan with pagination (scan ${scanCount})`);
        } else {
          console.log(`   Starting scan (scan ${scanCount})`);
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        console.log(`   Scanned ${response.Items?.length || 0} items in this batch`);
        
        if (response.Items && response.Items.length > 0) {
          allMatchingUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
        if (lastKey) {
          console.log(`   More items to scan, continuing...`);
        }
      } while (lastKey);
      
      if (allMatchingUsers.length > 0) {
        // Prioritize customer_app users with FCM tokens (for notifications)
        const customerAppUsersWithToken = allMatchingUsers.filter(u => 
          u.app_type === 'customer_app' && u.fcm_token
        );
        const customerAppUsersWithoutToken = allMatchingUsers.filter(u => 
          u.app_type === 'customer_app' && !u.fcm_token
        );
        const otherUsers = allMatchingUsers.filter(u => u.app_type !== 'customer_app');
        
        // Prefer customer_app users with FCM tokens
        if (customerAppUsersWithToken.length > 0) {
          customerAppUsersWithToken.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
          });
          const user = customerAppUsersWithToken[0];
          console.log(`   ✅ Found customer_app user with FCM token: ID=${user.id}, name=${user.name}, mob_num=${user.mob_num}`);
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
        
        // Then customer_app users without token
        if (customerAppUsersWithoutToken.length > 0) {
          customerAppUsersWithoutToken.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
          });
          const user = customerAppUsersWithoutToken[0];
          console.log(`   ✅ Found customer_app user: ID=${user.id}, name=${user.name}, mob_num=${user.mob_num}`);
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
        
        // Finally, other users (most recently updated)
        if (otherUsers.length > 0) {
          otherUsers.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
          });
          const user = otherUsers[0];
          console.log(`   ✅ Found user: ID=${user.id}, name=${user.name}, mob_num=${user.mob_num} (type: ${typeof user.mob_num})`);
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
      }
      
      console.log(`   ❌ No user found with mobile number ${mobNum} after ${scanCount} scan(s)`);
      return null;
    } catch (err) {
      console.error('Error in findByMobile:', err);
      throw err;
    }
  }

  // Find user by mobile number and app type
  static async findByMobileAndAppType(mobNum, appType) {
    try {
      const client = getDynamoDBClient();
      const mobileValue = typeof mobNum === 'string' && !isNaN(mobNum) ? parseInt(mobNum) : mobNum;
      
      console.log(`🔍 findByMobileAndAppType: Searching for mobile ${mobNum} with app_type=${appType}`);
      
      if (!appType) {
        console.log('⚠️  appType is null/undefined in findByMobileAndAppType - returning null');
        return null;
      }
      
      let lastKey = null;
      let scanCount = 0;
      const allMatchingUsers = [];
      
      do {
        scanCount++;
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'mob_num = :mobile AND attribute_exists(app_type) AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':mobile': mobileValue,
            ':appType': appType,
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items && response.Items.length > 0) {
          allMatchingUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      if (allMatchingUsers.length > 0) {
        // Prioritize users with FCM tokens (for customer_app, this ensures notifications work)
        const usersWithToken = allMatchingUsers.filter(u => u.fcm_token);
        const usersWithoutToken = allMatchingUsers.filter(u => !u.fcm_token);
        
        // If there are users with FCM tokens, prefer the most recently updated one
        if (usersWithToken.length > 0) {
          usersWithToken.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
          });
          const user = usersWithToken[0];
          console.log(`   ✅ Found user with FCM token: ID=${user.id}, app_type=${user.app_type}`);
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
        
        // Otherwise, use the most recently updated user without token
        if (usersWithoutToken.length > 0) {
          usersWithoutToken.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
          });
          const user = usersWithoutToken[0];
          console.log(`   ✅ Found user: ID=${user.id}, app_type=${user.app_type}`);
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error in findByMobileAndAppType:', err);
      console.error('Error stack:', err.stack);
      throw err;
    }
  }

  // Find all users by mobile number (returns array)
  static async findAllByMobile(mobNum) {
    try {
      const client = getDynamoDBClient();
      const mobileValue = typeof mobNum === 'string' && !isNaN(mobNum) ? parseInt(mobNum) : mobNum;
      
      console.log(`🔍 findAllByMobile: Searching for all users with mobile ${mobNum}`);
      
      let lastKey = null;
      const allUsers = [];
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'mob_num = :mobile',
          ExpressionAttributeValues: {
            ':mobile': mobileValue
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items && response.Items.length > 0) {
          const users = response.Items.map(user => {
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
          });
          allUsers.push(...users);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`   ✅ Found ${allUsers.length} user(s) with mobile number ${mobNum}`);
      return allUsers;
    } catch (err) {
      console.error('Error in findAllByMobile:', err);
      throw err;
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const client = getDynamoDBClient();
      
      // Scan with pagination to find the matching email
      // Note: Limit in ScanCommand limits items scanned, not filtered results
      let lastKey = null;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: {
            ':email': email
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items && response.Items.length > 0) {
          // Found the user
          const user = response.Items[0];
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return null;
    } catch (err) {
      throw err;
    }
  }

  // Check if email exists
  static async emailExists(email) {
    try {
      const user = await this.findByEmail(email);
      return !!user;
    } catch (err) {
      throw err;
    }
  }

  // Check if mobile exists
  static async mobileExists(mobNum) {
    try {
      console.log(`🔍 Checking mobile exists: ${mobNum} (type: ${typeof mobNum})`);
      const user = await this.findByMobile(mobNum);
      const exists = !!user;
      console.log(`   Mobile exists check result: ${exists}`);
      if (user) {
        console.log(`   Found user ID: ${user.id}, name: ${user.name}, mob_num: ${user.mob_num}`);
      }
      return exists;
    } catch (err) {
      console.error('Error in mobileExists:', err);
      throw err;
    }
  }

  // Update FCM token
  static async updateFcmToken(userId, fcmToken) {
    try {
      const client = getDynamoDBClient();
      const id = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      
      console.log('💾 User.updateFcmToken: Updating FCM token in database', {
        user_id: id,
        fcm_token_preview: fcmToken ? fcmToken.substring(0, 30) + '...' : 'missing',
        fcm_token_length: fcmToken ? fcmToken.length : 0
      });
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: id },
        UpdateExpression: 'SET fcm_token = :token, updated_at = :updated',
        ExpressionAttributeValues: {
          ':token': fcmToken,
          ':updated': new Date().toISOString()
        }
      });

      const result = await client.send(command);
      console.log('✅ User.updateFcmToken: FCM token successfully saved to database', {
        user_id: id,
        attributes_updated: result.Attributes ? Object.keys(result.Attributes) : []
      });
      
      return { affectedRows: 1 };
    } catch (err) {
      console.error('❌ User.updateFcmToken: Error saving FCM token to database', {
        user_id: userId,
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  // Clear FCM token
  static async clearFcmToken(userId) {
    try {
      const client = getDynamoDBClient();
      const id = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: id },
        UpdateExpression: 'REMOVE fcm_token SET updated_at = :updated',
        ExpressionAttributeValues: {
          ':updated': new Date().toISOString()
        }
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  // Update user profile
  static async updateProfile(userId, data) {
    try {
      const client = getDynamoDBClient();
      const id = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      
      // Build update expression
      const updateExpressions = [];
      const expressionAttributeValues = {};
      const expressionAttributeNames = {};
      
      Object.keys(data).forEach((key, index) => {
        if (data[key] !== undefined) {
          const attrName = `#attr${index}`;
          const attrValue = `:val${index}`;
          updateExpressions.push(`${attrName} = ${attrValue}`);
          expressionAttributeNames[attrName] = key;
          expressionAttributeValues[attrValue] = data[key];
        }
      });
      
      if (updateExpressions.length === 0) {
        return { affectedRows: 0 };
      }
      
      updateExpressions.push('#updated = :updated');
      expressionAttributeNames['#updated'] = 'updated_at';
      expressionAttributeValues[':updated'] = new Date().toISOString();
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  // Get user by ID (directly from DynamoDB, no Redis cache)
  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      const userId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: userId }
      });

      const response = await client.send(command);
      
      if (!response.Item) {
        return null;
      }

      const user = response.Item;
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (err) {
      throw err;
    }
  }

  // Find users by IDs (batch operation)
  static async findByIds(ids) {
    try {
      const client = getDynamoDBClient();
      const allUsers = [];
      
      // DynamoDB BatchGetItem can handle up to 100 items per request
      const batchSize = 100;
      
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const keys = batch.map(id => ({
          id: typeof id === 'string' && !isNaN(id) ? parseInt(id) : id
        }));

        const command = new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: {
              Keys: keys
            }
          }
        });

        const response = await client.send(command);
        if (response.Responses && response.Responses[TABLE_NAME]) {
          const users = response.Responses[TABLE_NAME].map(user => {
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
          });
          allUsers.push(...users);
        }
      }

      return allUsers;
    } catch (err) {
      throw err;
    }
  }

  // Find user by name (exact match)
  static async findByName(name) {
    try {
      const client = getDynamoDBClient();
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'name = :name',
        ExpressionAttributeValues: {
          ':name': name
        },
        Limit: 1
      });

      const response = await client.send(command);
      if (response.Items && response.Items.length > 0) {
        const user = response.Items[0];
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
      return null;
    } catch (err) {
      throw err;
    }
  }

  // Search users by name (partial match)
  static async searchByName(name, limit = 10) {
    try {
      const client = getDynamoDBClient();
      
      // DynamoDB doesn't support LIKE, so we scan and filter in memory
      // For production, consider using a GSI or full-text search service
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 1000 // Scan more items to find matches
      });

      const response = await client.send(command);
      const allUsers = response.Items || [];
      
      // Filter by name containing the search term (case-insensitive)
      const searchTerm = name.toLowerCase();
      const matchingUsers = allUsers
        .filter(user => user.name && user.name.toLowerCase().includes(searchTerm))
        .slice(0, limit)
        .map(user => {
          const { password: _, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });
      
      return matchingUsers;
    } catch (err) {
      throw err;
    }
  }

  // Batch create users
  static async batchCreate(users) {
    try {
      const client = getDynamoDBClient();
      const allResults = [];
      
      // DynamoDB BatchWriteItem can handle up to 25 items per request
      const batchSize = 25;
      
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        const putRequests = batch.map(user => ({
          PutRequest: {
            Item: {
              ...user,
              id: user.id || (Date.now() + Math.floor(Math.random() * 1000)),
              created_at: user.created_at || new Date().toISOString(),
              updated_at: user.updated_at || new Date().toISOString()
            }
          }
        }));

        const command = new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: putRequests
          }
        });

        const response = await client.send(command);
        allResults.push(response);
      }

      return allResults;
    } catch (err) {
      throw err;
    }
  }

  // Batch update users
  static async batchUpdate(updates) {
    // DynamoDB doesn't have batch update, so we'll do individual updates
    // But we can parallelize them
    try {
      const promises = updates.map(update => {
        const { id, ...data } = update;
        return this.updateProfile(id, data);
      });
      
      await Promise.all(promises);
      return { affectedRows: updates.length };
    } catch (err) {
      throw err;
    }
  }

  // Count users by user_type (optimized with Select: "COUNT")
  static async countByUserType(userType) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_type = :userType',
          ExpressionAttributeValues: {
            ':userType': userType
          },
          Select: 'COUNT'
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        // With Select: "COUNT", response.Count contains the count
        count += response.Count || 0;
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return count;
    } catch (err) {
      throw err;
    }
  }

  // Count users by user_type and current month (optimized with Select: "COUNT")
  static async countByUserTypeAndCurrentMonth(userType) {
    try {
      const client = getDynamoDBClient();
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_type = :userType',
          ExpressionAttributeValues: {
            ':userType': userType
          }
          // Note: Can't use Select: "COUNT" here because we need items to filter by date
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter by current month in memory
          const matching = response.Items.filter(user => {
            if (!user.created_at) return false;
            const userDate = new Date(user.created_at);
            return userDate.getMonth() + 1 === currentMonth && userDate.getFullYear() === currentYear;
          });
          count += matching.length;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return count;
    } catch (err) {
      throw err;
    }
  }

  // Get users with FCM token by user_type
  static async findWithFcmTokenByUserType(userType) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const users = [];
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_type = :userType AND attribute_exists(fcm_token)',
          ExpressionAttributeValues: {
            ':userType': userType
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter out users without fcm_token (attribute_exists might not work as expected)
          const withToken = response.Items.filter(u => u.fcm_token);
          users.push(...withToken.map(u => ({
            id: u.id,
            name: u.name
          })));
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return users;
    } catch (err) {
      throw err;
    }
  }

  // Get monthly count by user_type
  static async getMonthlyCountByUserType(userType) {
    try {
      const client = getDynamoDBClient();
      const currentYear = new Date().getFullYear();
      const monthlyCounts = new Array(12).fill(0);
      
      let lastKey = null;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_type = :userType',
          ExpressionAttributeValues: {
            ':userType': userType
          },
          ProjectionExpression: 'created_at' // Only get needed field
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        // Process items incrementally instead of storing all
        if (response.Items) {
          response.Items.forEach(user => {
            if (user.created_at) {
              const date = new Date(user.created_at);
              if (date.getFullYear() === currentYear) {
                const month = date.getMonth(); // 0-11
                monthlyCounts[month]++;
              }
            }
          });
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return monthlyCounts;
    } catch (err) {
      throw err;
    }
  }

  // Get all users
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allUsers = [];
      
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          allUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return allUsers;
    } catch (err) {
      throw err;
    }
  }

  // Count all users
  static async count() {
    try {
      const customers = await this.countByUserType('C');
      const shops = await this.countByUserType('S');
      const deliveryBoys = await this.countByUserType('D');
      return customers + shops + deliveryBoys;
    } catch (err) {
      throw err;
    }
  }

  // Count v2 users (users with app_version = 'v2')
  static async countV2Users() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;
      
      do {
        // Scan all users and filter in memory to handle cases where app_version might not exist
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter for users with app_version = 'v2'
          const v2Users = response.Items.filter(user => {
            return user.app_version === 'v2';
          });
          count += v2Users.length;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return count;
    } catch (err) {
      console.error('User.countV2Users error:', err);
      throw err;
    }
  }

  // Count v2 B2B users (app_version = 'v2' AND (user_type = 'S' OR user_type = 'SR'))
  static async countV2B2BUsers() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          const v2B2BUsers = response.Items.filter(user => {
            return user.app_version === 'v2' && (user.user_type === 'S' || user.user_type === 'SR');
          });
          count += v2B2BUsers.length;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return count;
    } catch (err) {
      console.error('User.countV2B2BUsers error:', err);
      throw err;
    }
  }

  // Count v2 B2C users (app_version = 'v2' AND (user_type = 'R' OR user_type = 'SR'))
  static async countV2B2CUsers() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          const v2B2CUsers = response.Items.filter(user => {
            return user.app_version === 'v2' && (user.user_type === 'R' || user.user_type === 'SR');
          });
          count += v2B2CUsers.length;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return count;
    } catch (err) {
      console.error('User.countV2B2CUsers error:', err);
      throw err;
    }
  }

  // Get B2B users with pagination (user_type = 'S' or 'SR')
  static async getB2BUsers(page = 1, limit = 10, search = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      
      let lastKey = null;
      const allUsers = [];
      const userIdsWithB2BShop = new Set(); // Track users with shop_type = 1 (Industrial) or 4 (Wholesaler)
      let scannedCount = 0;
      
      // First, find all shops with shop_type = 1 (Industrial) or 4 (Wholesaler) to identify v1 B2B users
      console.log('🔍 Scanning shops for shop_type = 1 (Industrial) or 4 (Wholesaler)...');
      let shopLastKey = null;
      do {
        const shopParams = {
          TableName: 'shops'
        };
        
        if (shopLastKey) {
          shopParams.ExclusiveStartKey = shopLastKey;
        }
        
        const shopCommand = new ScanCommand(shopParams);
        const shopResponse = await client.send(shopCommand);
        
        if (shopResponse.Items) {
          shopResponse.Items.forEach(shop => {
            // Include shops with shop_type = 1 (Industrial) or 4 (Wholesaler)
            if (shop.user_id && (shop.shop_type === 1 || shop.shop_type === 4)) {
              userIdsWithB2BShop.add(shop.user_id);
            }
          });
        }
        
        shopLastKey = shopResponse.LastEvaluatedKey;
      } while (shopLastKey);
      
      console.log(`✅ Found ${userIdsWithB2BShop.size} users with shop_type = 1 (Industrial) or 4 (Wholesaler)`);
      
      // Now, collect all B2B users (we need to scan all to filter)
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          scannedCount += response.Items.length;
          // Filter for B2B users:
          // 1. user_type = 'S' or 'SR' (v2 B2B users)
          // 2. OR user has shop_type = 1 (Industrial) or 4 (Wholesaler) (v1 B2B users)
          // IMPORTANT: Exclude user_type = 'D' (Delivery users) even if they have a B2B shop
          let b2bUsers = response.Items.filter(user => {
            // Exclude Delivery users (user_type 'D')
            if (user.user_type === 'D') {
              return false;
            }
            const isV2B2B = user.user_type === 'S' || user.user_type === 'SR';
            const isV1B2B = userIdsWithB2BShop.has(user.id);
            return isV2B2B || isV1B2B;
          });
          
          // Note: Search filtering is done in the controller after enriching with shop data
          // This allows searching by both user.mob_num and shop.contact
          
          allUsers.push(...b2bUsers);
        }
        
        lastKey = response.LastEvaluatedKey;
        // Stop if no more items to scan OR if we have enough for pagination
        // (we need at least skip + pageSize items, but we'll get all for accurate total count)
      } while (lastKey);
      
      // Sort by created_at descending (newest first)
      allUsers.sort((a, b) => {
        // Handle missing or invalid dates - use created_at or fallback to updated_at
        let dateA = a.created_at ? new Date(a.created_at) : null;
        let dateB = b.created_at ? new Date(b.created_at) : null;
        
        // If dates are invalid or missing, use updated_at as fallback
        if (!dateA || isNaN(dateA.getTime())) {
          dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        }
        if (!dateB || isNaN(dateB.getTime())) {
          dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        }
        
        // Sort descending (newest first)
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`✅ Sorted ${allUsers.length} B2B users by newest first`);
      if (allUsers.length > 0) {
        console.log(`   First user: ${allUsers[0].name} (created: ${allUsers[0].created_at})`);
        if (allUsers.length > 1) {
          console.log(`   Last user: ${allUsers[allUsers.length - 1].name} (created: ${allUsers[allUsers.length - 1].created_at})`);
        }
      }
      
      // Get total count
      const total = allUsers.length;
      
      // Apply pagination (if limit is very large, return all users)
      const paginatedUsers = pageSize >= 999999 ? allUsers : allUsers.slice(skip, skip + pageSize);
      
      // Remove password from results
      const usersWithoutPassword = paginatedUsers.map(user => {
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return {
        users: usersWithoutPassword,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: skip + pageSize < total
      };
    } catch (err) {
      console.error('User.getB2BUsers error:', err);
      throw err;
    }
  }

  // Get B2C users with pagination (user_type = 'R' or 'SR', OR shop_type = 2 or 3 for v1 retailers)
  static async getB2CUsers(page = 1, limit = 10, search = null) {
    try {
      const client = getDynamoDBClient();
      const Shop = require('./Shop');
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      
      let lastKey = null;
      const allUsers = [];
      const userIdsWithRetailerShop = new Set(); // Track users with shop_type = 2 or 3
      let scannedCount = 0;
      
      // First, find all shops with shop_type = 2 (Retailer/Door Step Buyer) or 3 (Retailer B2C) to identify v1 B2C users
      console.log('🔍 Scanning shops for shop_type = 2 (Retailer/Door Step Buyer) or 3 (Retailer B2C)...');
      let shopLastKey = null;
      do {
        const shopParams = {
          TableName: 'shops'
        };
        
        if (shopLastKey) {
          shopParams.ExclusiveStartKey = shopLastKey;
        }
        
        const shopCommand = new ScanCommand(shopParams);
        const shopResponse = await client.send(shopCommand);
        
        if (shopResponse.Items) {
          shopResponse.Items.forEach(shop => {
            // Include shops with shop_type = 2 (Retailer/Door Step Buyer) or 3 (Retailer B2C)
            if (shop.user_id && (shop.shop_type === 2 || shop.shop_type === 3)) {
              userIdsWithRetailerShop.add(shop.user_id);
            }
          });
        }
        
        shopLastKey = shopResponse.LastEvaluatedKey;
      } while (shopLastKey);
      
      console.log(`✅ Found ${userIdsWithRetailerShop.size} users with shop_type = 2 (Retailer/Door Step Buyer) or 3 (Retailer B2C)`);
      
      // Now, collect all B2C users (we need to scan all to filter)
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          scannedCount += response.Items.length;
          // Filter for B2C users:
          // 1. user_type = 'R' or 'SR' (v2 B2C users)
          // 2. OR user has shop_type = 2 (v1 Retailer/Door Step Buyer) or 3 (v1 Retailer B2C)
          let b2cUsers = response.Items.filter(user => {
            const isV2B2C = user.user_type === 'R' || user.user_type === 'SR';
            const isV1Retailer = userIdsWithRetailerShop.has(user.id);
            return isV2B2C || isV1Retailer;
          });
          
          // Note: Search filtering is done in the controller after enriching with shop data
          // This allows searching by both user.mob_num and shop.contact
          
          allUsers.push(...b2cUsers);
        }
        
        lastKey = response.LastEvaluatedKey;
        // Stop if no more items to scan OR if we have enough for pagination
        // (we need at least skip + pageSize items, but we'll get all for accurate total count)
      } while (lastKey);
      
      // Sort by created_at descending (newest first)
      allUsers.sort((a, b) => {
        // Handle missing or invalid dates - use created_at or fallback to updated_at
        let dateA = a.created_at ? new Date(a.created_at) : null;
        let dateB = b.created_at ? new Date(b.created_at) : null;
        
        // If dates are invalid or missing, use updated_at as fallback
        if (!dateA || isNaN(dateA.getTime())) {
          dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        }
        if (!dateB || isNaN(dateB.getTime())) {
          dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        }
        
        // Sort descending (newest first)
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`✅ Sorted ${allUsers.length} B2C users by newest first`);
      if (allUsers.length > 0) {
        console.log(`   First user: ${allUsers[0].name} (created: ${allUsers[0].created_at})`);
        if (allUsers.length > 1) {
          console.log(`   Last user: ${allUsers[allUsers.length - 1].name} (created: ${allUsers[allUsers.length - 1].created_at})`);
        }
      }
      
      // Get total count
      const total = allUsers.length;
      
      // Apply pagination (if limit is very large, return all users)
      const paginatedUsers = pageSize >= 999999 ? allUsers : allUsers.slice(skip, skip + pageSize);
      
      // Remove password from results
      const usersWithoutPassword = paginatedUsers.map(user => {
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return {
        users: usersWithoutPassword,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: skip + pageSize < total
      };
    } catch (err) {
      console.error('User.getB2CUsers error:', err);
      throw err;
    }
  }

  // Get Delivery users with pagination (user_type = 'D')
  static async getDeliveryUsers(page = 1, limit = 10, search = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      
      let lastKey = null;
      const allUsers = [];
      
      // Collect all Delivery users (user_type = 'D')
      console.log('🔍 Scanning users for user_type = "D" (Delivery)...');
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter for Delivery users: user_type = 'D'
          const deliveryUsers = response.Items.filter(user => {
            return user.user_type === 'D';
          });
          
          allUsers.push(...deliveryUsers);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by created_at descending (newest first)
      allUsers.sort((a, b) => {
        // Handle missing or invalid dates - use created_at or fallback to updated_at
        let dateA = a.created_at ? new Date(a.created_at) : null;
        let dateB = b.created_at ? new Date(b.created_at) : null;
        
        // If dates are invalid or missing, use updated_at as fallback
        if (!dateA || isNaN(dateA.getTime())) {
          dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        }
        if (!dateB || isNaN(dateB.getTime())) {
          dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        }
        
        // Sort descending (newest first)
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`✅ Sorted ${allUsers.length} Delivery users by newest first`);
      if (allUsers.length > 0) {
        console.log(`   First user: ${allUsers[0].name} (created: ${allUsers[0].created_at})`);
        if (allUsers.length > 1) {
          console.log(`   Last user: ${allUsers[allUsers.length - 1].name} (created: ${allUsers[allUsers.length - 1].created_at})`);
        }
      }
      
      // Get total count
      const total = allUsers.length;
      
      // Apply pagination (if limit is very large, return all users)
      const paginatedUsers = pageSize >= 999999 ? allUsers : allUsers.slice(skip, skip + pageSize);
      
      // Remove password from results
      const usersWithoutPassword = paginatedUsers.map(user => {
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return {
        users: usersWithoutPassword,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: skip + pageSize < total
      };
    } catch (err) {
      console.error('User.getDeliveryUsers error:', err);
      throw err;
    }
  }

  // Get Customers (common users) with pagination (user_type = 'C')
  static async getCustomers(page = 1, limit = 10, search = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      
      let lastKey = null;
      const allUsers = [];
      
      // Collect all Customer users (user_type = 'C')
      // This includes both old customers (no app_type) and new customer_app users (app_type = 'customer_app')
      console.log('🔍 Scanning users for user_type = "C" (Customers - including customer_app users)...');
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_type = :userType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':userType': 'C',
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter to include only customer_app users or users without app_type (old customers)
          // Exclude vendor_app users even if they have user_type = 'C' (shouldn't happen, but safety check)
          const customerUsers = response.Items.filter(user => 
            !user.app_type || 
            user.app_type === 'customer_app' || 
            user.app_type === '' ||
            user.app_type === null
          );
          allUsers.push(...customerUsers);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by created_at descending (newest first)
      allUsers.sort((a, b) => {
        let dateA = a.created_at ? new Date(a.created_at) : null;
        let dateB = b.created_at ? new Date(b.created_at) : null;
        
        if (!dateA || isNaN(dateA.getTime())) {
          dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        }
        if (!dateB || isNaN(dateB.getTime())) {
          dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        }
        
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`✅ Sorted ${allUsers.length} Customer users by newest first`);
      
      // Get total count
      const total = allUsers.length;
      
      // Apply pagination (if limit is very large, return all users)
      const paginatedUsers = pageSize >= 999999 ? allUsers : allUsers.slice(skip, skip + pageSize);
      
      // Remove password from results
      const usersWithoutPassword = paginatedUsers.map(user => {
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return {
        users: usersWithoutPassword,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: skip + pageSize < total
      };
    } catch (err) {
      console.error('User.getCustomers error:', err);
      throw err;
    }
  }

  // Get Delivery users with pagination (user_type = 'D')
  static async getDeliveryUsers(page = 1, limit = 10, search = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      
      let lastKey = null;
      const allUsers = [];
      
      // Collect all Delivery users (user_type = 'D')
      console.log('🔍 Scanning users for user_type = "D" (Delivery)...');
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter for Delivery users: user_type = 'D'
          const deliveryUsers = response.Items.filter(user => {
            return user.user_type === 'D';
          });
          
          allUsers.push(...deliveryUsers);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by created_at descending (newest first)
      allUsers.sort((a, b) => {
        // Handle missing or invalid dates - use created_at or fallback to updated_at
        let dateA = a.created_at ? new Date(a.created_at) : null;
        let dateB = b.created_at ? new Date(b.created_at) : null;
        
        // If dates are invalid or missing, use updated_at as fallback
        if (!dateA || isNaN(dateA.getTime())) {
          dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        }
        if (!dateB || isNaN(dateB.getTime())) {
          dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        }
        
        // Sort descending (newest first)
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`✅ Sorted ${allUsers.length} Delivery users by newest first`);
      if (allUsers.length > 0) {
        console.log(`   First user: ${allUsers[0].name} (created: ${allUsers[0].created_at})`);
        if (allUsers.length > 1) {
          console.log(`   Last user: ${allUsers[allUsers.length - 1].name} (created: ${allUsers[allUsers.length - 1].created_at})`);
        }
      }
      
      // Get total count
      const total = allUsers.length;
      
      // Apply pagination (if limit is very large, return all users)
      const paginatedUsers = pageSize >= 999999 ? allUsers : allUsers.slice(skip, skip + pageSize);
      
      // Remove password from results
      const usersWithoutPassword = paginatedUsers.map(user => {
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return {
        users: usersWithoutPassword,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: skip + pageSize < total
      };
    } catch (err) {
      console.error('User.getDeliveryUsers error:', err);
      throw err;
    }
  }

  // Get Customers (common users) with pagination (user_type = 'C')
  static async getCustomers(page = 1, limit = 10, search = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      
      let lastKey = null;
      const allUsers = [];
      
      // Collect all Customer users (user_type = 'C')
      // This includes both old customers (no app_type) and new customer_app users (app_type = 'customer_app')
      console.log('🔍 Scanning users for user_type = "C" (Customers - including customer_app users)...');
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_type = :userType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':userType': 'C',
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter to include only customer_app users or users without app_type (old customers)
          // Exclude vendor_app users even if they have user_type = 'C' (shouldn't happen, but safety check)
          const customerUsers = response.Items.filter(user => 
            !user.app_type || 
            user.app_type === 'customer_app' || 
            user.app_type === '' ||
            user.app_type === null
          );
          allUsers.push(...customerUsers);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by created_at descending (newest first)
      allUsers.sort((a, b) => {
        let dateA = a.created_at ? new Date(a.created_at) : null;
        let dateB = b.created_at ? new Date(b.created_at) : null;
        
        if (!dateA || isNaN(dateA.getTime())) {
          dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        }
        if (!dateB || isNaN(dateB.getTime())) {
          dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        }
        
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`✅ Sorted ${allUsers.length} Customer users by newest first`);
      
      // Get total count
      const total = allUsers.length;
      
      // Apply pagination (if limit is very large, return all users)
      const paginatedUsers = pageSize >= 999999 ? allUsers : allUsers.slice(skip, skip + pageSize);
      
      // Remove password from results
      const usersWithoutPassword = paginatedUsers.map(user => {
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return {
        users: usersWithoutPassword,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: skip + pageSize < total
      };
    } catch (err) {
      console.error('User.getCustomers error:', err);
      throw err;
    }
  }
}

module.exports = User;