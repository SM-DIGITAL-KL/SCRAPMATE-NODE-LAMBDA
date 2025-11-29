/**
 * V2 Shop Type Service
 * Business logic for shop types and dashboard management
 */

const Shop = require('../../models/Shop');
const User = require('../../models/User');

class V2ShopTypeService {
  /**
   * Get all available shop types
   * @returns {Array} Shop types array
   */
  static getShopTypes() {
    return [
      {
        id: 1,
        name: 'Industrial',
        description: 'Industrial scrap sellers',
        dashboard_type: 'b2b'
      },
      {
        id: 2,
        name: 'Door Step Buyer',
        description: 'Door-to-door scrap buyers',
        dashboard_type: 'delivery' // Cannot login as B2B or B2C
      },
      {
        id: 3,
        name: 'Retailer',
        description: 'Retail scrap sellers',
        dashboard_type: 'b2c'
      },
      {
        id: 4,
        name: 'Wholesaler',
        description: 'Wholesale scrap sellers',
        dashboard_type: 'b2b'
      }
    ];
  }

  /**
   * Get shop type name by ID
   * @param {number} shopTypeId - Shop type ID
   * @returns {string} Shop type name
   */
  static getShopTypeName(shopTypeId) {
    const shopTypes = this.getShopTypes();
    const shopType = shopTypes.find(st => st.id === shopTypeId);
    return shopType ? shopType.name : 'Unknown';
  }

  /**
   * Get user's allowed dashboards based on shop type
   * @param {number} userId - User ID
   * @returns {Promise<{shopType: number|null, shopTypeName: string|null, allowedDashboards: Array, canSwitch: boolean}>}
   */
  static async getUserDashboards(userId) {
    // Get user details
    const user = await User.findById(parseInt(userId));
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is v1 (no restrictions) or v2 (with restrictions)
    const isV1User = !user.app_version || user.app_version === 'v1';

    // Get shop details for this user
    const shop = await Shop.findByUserId(parseInt(userId));

    let allowedDashboards = [];
    let shopType = null;
    let shopTypeName = null;

    if (isV1User) {
      // V1 users can access any dashboard - no restrictions based on shop_type
      console.log(`📱 V1 user (ID: ${user.id}) - allowing access to all dashboards (no restrictions)`);
      allowedDashboards = ['b2b', 'b2c', 'delivery'];
      if (shop && shop.shop_type) {
        shopType = parseInt(shop.shop_type);
        shopTypeName = this.getShopTypeName(shopType);
      }
    } else if (shop && shop.shop_type) {
      // V2 users: Apply shop_type restrictions
      shopType = parseInt(shop.shop_type);
      shopTypeName = this.getShopTypeName(shopType);

      // Determine allowed dashboards based on shop type
      switch (shopType) {
        case 1: // Industrial - B2B, can also switch to B2C if user is SR (B2B+B2C)
          allowedDashboards = ['b2b'];
          // 'SR' = B2B+B2C in vendor app - can access both dashboards
          if (user.user_type === 'SR') {
            allowedDashboards.push('b2c');
          }
          break;
        case 2: // Door Step Buyer - Delivery Partner only
          allowedDashboards = ['delivery'];
          break;
        case 3: // Retailer - B2C, can also switch to B2B if user is SR (B2B+B2C)
          allowedDashboards = ['b2c'];
          // 'SR' = B2B+B2C in vendor app - can access both dashboards
          if (user.user_type === 'SR') {
            allowedDashboards.push('b2b');
          }
          break;
        case 4: // Wholesaler - B2B, can also switch to B2C if user is SR (B2B+B2C)
          allowedDashboards = ['b2b'];
          // 'SR' = B2B+B2C in vendor app - can access both dashboards
          if (user.user_type === 'SR') {
            allowedDashboards.push('b2c');
          }
          break;
        default:
          allowedDashboards = [];
      }
    } else {
      // If user doesn't have a shop, check user_type
      if (user.user_type === 'SR') {
        // SR users (B2B + B2C in vendor app) can access both dashboards
        allowedDashboards = ['b2b', 'b2c'];
      } else if (user.user_type === 'R') {
        // R = B2C in vendor app
        allowedDashboards = ['b2c'];
      } else if (user.user_type === 'C' || user.user_type === 'U') {
        // C = customer app, U = web user (both can access B2C)
        allowedDashboards = ['b2c'];
      } else if (user.user_type === 'S') {
        // S = B2B in vendor app
        allowedDashboards = ['b2b'];
      } else if (user.user_type === 'D') {
        allowedDashboards = ['delivery'];
      }
    }

    // Users can switch if they have multiple dashboards or are SR type
    const canSwitch = allowedDashboards.length > 1 || 
                     user.user_type === 'SR' ||
                     (shopType && [1, 4].includes(shopType) && (user.user_type === 'R' || user.user_type === 'SR' || user.user_type === 'C'));

    return {
      shopType,
      shopTypeName,
      allowedDashboards,
      canSwitch
    };
  }

  /**
   * Validate if user can access a specific dashboard
   * @param {number} userId - User ID
   * @param {string} dashboardType - Dashboard type ('b2b', 'b2c', 'delivery')
   * @returns {Promise<{canAccess: boolean, reason: string|null}>}
   */
  static async validateDashboard(userId, dashboardType) {
    // Get user details
    const user = await User.findById(parseInt(userId));
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is v1 (no restrictions) or v2 (with restrictions)
    const isV1User = !user.app_version || user.app_version === 'v1';

    // V1 users can access any dashboard - no restrictions
    if (isV1User) {
      console.log(`📱 V1 user (ID: ${user.id}) - allowing access to ${dashboardType} dashboard (no restrictions)`);
      return {
        canAccess: true,
        reason: null
      };
    }

    // V2 users: Apply restrictions based on shop_type and user_type
    // Get shop details
    const shop = await Shop.findByUserId(parseInt(userId));

    let canAccess = false;
    let reason = '';

    if (shop && shop.shop_type) {
      const shopType = parseInt(shop.shop_type);

      switch (dashboardType.toLowerCase()) {
        case 'b2b':
          // B2B: Industrial (1), Wholesaler (4), or Retailer (3) if user is shop owner or SR
          canAccess = [1, 4].includes(shopType) || (shopType === 3 && (user.user_type === 'S' || user.user_type === 'SR'));
          if (!canAccess) {
            reason = `Shop type ${this.getShopTypeName(shopType)} cannot access B2B dashboard`;
          }
          break;
        case 'b2c':
          // B2C: Retailer (3), or Industrial (1)/Wholesaler (4) if user is also a retailer (R), SR, or customer app (C)
          canAccess = shopType === 3 || ([1, 4].includes(shopType) && (user.user_type === 'R' || user.user_type === 'SR' || user.user_type === 'C' || user.user_type === 'U'));
          if (!canAccess) {
            reason = `Shop type ${this.getShopTypeName(shopType)} cannot access B2C dashboard`;
          }
          break;
        case 'delivery':
          // Delivery: Door Step Buyer (2)
          canAccess = shopType === 2;
          if (!canAccess) {
            reason = `Shop type ${this.getShopTypeName(shopType)} cannot access Delivery dashboard`;
          }
          break;
        default:
          canAccess = false;
          reason = 'Invalid dashboard type';
      }
    } else {
      // User without shop - check user_type
      if (dashboardType.toLowerCase() === 'delivery') {
        // Only Delivery users (type 'D') can access delivery dashboard
        canAccess = user.user_type === 'D';
        if (!canAccess) {
          reason = `User type '${user.user_type}' cannot access Delivery dashboard. Only Delivery partners (type 'D') can access this dashboard.`;
        }
      } else if (user.user_type === 'SR') {
        // SR users (B2B + B2C in vendor app) can access both B2B and B2C dashboards
        canAccess = dashboardType.toLowerCase() === 'b2b' || dashboardType.toLowerCase() === 'b2c';
        if (!canAccess) {
          reason = 'SR users can only access B2B or B2C dashboards';
        }
      } else if (dashboardType.toLowerCase() === 'b2c' && (user.user_type === 'R' || user.user_type === 'C' || user.user_type === 'U')) {
        // R = B2C in vendor app, C = customer app, U = web user
        canAccess = true;
      } else if (dashboardType.toLowerCase() === 'b2b' && user.user_type === 'S') {
        // S = B2B in vendor app
        canAccess = true;
      } else {
        canAccess = false;
        reason = `User type '${user.user_type}' does not have access to ${dashboardType} dashboard`;
      }
    }

    return {
      canAccess,
      reason: reason || null
    };
  }

  /**
   * Switch user's current dashboard
   * @param {number} userId - User ID
   * @param {string} targetDashboard - Target dashboard ('b2b', 'b2c', 'delivery')
   * @returns {Promise<{success: boolean, message: string, data: object}>}
   */
  static async switchDashboard(userId, targetDashboard) {
    // Validate dashboard access first
    const validation = await this.validateDashboard(userId, targetDashboard);

    if (!validation.canAccess) {
      return {
        success: false,
        message: validation.reason || 'Cannot switch to this dashboard',
        data: {
          canSwitch: false,
          reason: validation.reason
        }
      };
    }

    // Get user's allowed dashboards
    const dashboards = await this.getUserDashboards(userId);

    // Check if target dashboard is in allowed list
    if (!dashboards.allowedDashboards.includes(targetDashboard.toLowerCase())) {
      return {
        success: false,
        message: 'Target dashboard is not in allowed dashboards',
        data: {
          canSwitch: false,
          reason: 'Target dashboard not allowed for this user'
        }
      };
    }

    // Dashboard switch is allowed
    // In a real implementation, you might want to store the current dashboard preference
    // For now, we just validate and return success

    return {
      success: true,
      message: 'Dashboard switch validated successfully',
      data: {
        canSwitch: true,
        currentDashboards: dashboards.allowedDashboards,
        targetDashboard: targetDashboard.toLowerCase(),
        shopType: dashboards.shopType,
        shopTypeName: dashboards.shopTypeName
      }
    };
  }
}

module.exports = V2ShopTypeService;

