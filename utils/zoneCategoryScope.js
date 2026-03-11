const { normalizeZoneCode } = require('./zoneRequestScope');

function isZoneScopedItem(item) {
  const scope = normalizeZoneCode(item?.zone_scope || item?.zone_code || item?.zone || '');
  return Boolean(scope);
}

function getItemZone(item) {
  return normalizeZoneCode(item?.zone_scope || item?.zone_code || item?.zone || '');
}

function applyCategoryOverrides(category, zoneCode, options = {}) {
  if (!zoneCode) return category;

  const zoneOverrides = category?.zone_overrides || category?.zoneOverrides || {};
  const zoneOverride = zoneOverrides[zoneCode];
  if (!zoneOverride || typeof zoneOverride !== 'object') return category;

  if (zoneOverride.deleted === true) {
    if (options.includeDeleted) {
      return {
        ...category,
        deleted: true,
        updated_at: zoneOverride.updated_at || category.updated_at
      };
    }
    return null;
  }

  return {
    ...category,
    category_name: zoneOverride.category_name !== undefined ? zoneOverride.category_name : category.category_name,
    cat_name: zoneOverride.cat_name !== undefined ? zoneOverride.cat_name : category.cat_name,
    category_img: zoneOverride.category_img !== undefined ? zoneOverride.category_img : category.category_img,
    cat_img: zoneOverride.cat_img !== undefined ? zoneOverride.cat_img : category.cat_img
  };
}

function applySubcategoryOverrides(subcategory, zoneCode, options = {}) {
  if (!zoneCode) return subcategory;

  const zoneOverrides = subcategory?.zone_overrides || subcategory?.zoneOverrides || {};
  const zoneOverride = zoneOverrides[zoneCode];
  if (!zoneOverride || typeof zoneOverride !== 'object') return subcategory;

  if (zoneOverride.deleted === true) {
    if (options.includeDeleted) {
      return {
        ...subcategory,
        deleted: true,
        updated_at: zoneOverride.updated_at || subcategory.updated_at
      };
    }
    return null;
  }

  return {
    ...subcategory,
    subcategory_name: zoneOverride.subcategory_name !== undefined ? zoneOverride.subcategory_name : subcategory.subcategory_name,
    subcategory_img: zoneOverride.subcategory_img !== undefined ? zoneOverride.subcategory_img : subcategory.subcategory_img,
    default_price: zoneOverride.default_price !== undefined ? zoneOverride.default_price : subcategory.default_price,
    price_unit: zoneOverride.price_unit !== undefined ? zoneOverride.price_unit : subcategory.price_unit
  };
}

function filterCategoriesForZone(categories, zoneCode, options = {}) {
  const normalizedZone = normalizeZoneCode(zoneCode || '');
  const list = Array.isArray(categories) ? categories : [];

  return list
    .map((category) => {
      const itemZone = getItemZone(category);
      if (itemZone && (!normalizedZone || itemZone !== normalizedZone)) {
        return null;
      }

      const overridden = applyCategoryOverrides(category, normalizedZone, options);
      return overridden || null;
    })
    .filter(Boolean);
}

function filterSubcategoriesForZone(subcategories, zoneCode, allowedCategoryIds = null, options = {}) {
  const normalizedZone = normalizeZoneCode(zoneCode || '');
  const list = Array.isArray(subcategories) ? subcategories : [];
  const allowedSet = allowedCategoryIds ? new Set(Array.from(allowedCategoryIds)) : null;

  return list
    .map((sub) => {
      const itemZone = getItemZone(sub);
      if (itemZone && (!normalizedZone || itemZone !== normalizedZone)) {
        return null;
      }

      if (allowedSet && !allowedSet.has(sub.main_category_id)) {
        return null;
      }

      const overridden = applySubcategoryOverrides(sub, normalizedZone, options);
      return overridden || null;
    })
    .filter(Boolean);
}

module.exports = {
  getItemZone,
  isZoneScopedItem,
  filterCategoriesForZone,
  filterSubcategoriesForZone
};
