/**
 * V2 Services Index
 * Centralized exports for all V2 services
 * Services are organized by domain in their respective folders
 */

const V2AuthService = require('../auth/v2AuthService');
const V2ShopTypeService = require('../shop/v2ShopTypeService');
const V2ProfileService = require('../user/v2ProfileService');
const V2B2BSignupService = require('../shop/v2B2BSignupService');

module.exports = {
  V2AuthService,
  V2ShopTypeService,
  V2ProfileService,
  V2B2BSignupService,
};

