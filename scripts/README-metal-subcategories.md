# Metal Subcategories Update Script

This script adds missing metal subcategories to the database with prices 20% less than the market rates provided.

## Features

- **Finds missing subcategories**: Compares market rates with existing database subcategories
- **Adds missing subcategories**: Creates new subcategories with prices 20% less than market rates
- **Updates missing prices**: Updates existing subcategories that have 0 or missing prices
- **Converts MT to kg**: Automatically converts metric ton prices to per kg (1 MT = 1000 kg)
- **Handles unavailable prices**: Skips items marked with `*+/-` or `*** MT` (unavailable prices)

## Market Rates Included

The script includes the following metal categories and their latest rates (from 07.01.2026):

### Brass
- Brass Local/Purja/GB: ₹649/kg
- Brass Chadri: ₹676/kg
- Brass Honey: ₹683/kg
- Brass Vilaity (Local/Imported): ₹688-698/kg
- Brass Honey (Gulf/Europe/U.K): ₹713-717/kg

### Copper
- Copper Scrap Armature: ₹1130/kg

### Gun Metal
- Gun Metal Local: ₹784/kg
- Gun Metal Mix: ₹794/kg
- Gun Metal Jalandhar: ₹814/kg

### Aluminium
- Aluminium Company: ₹323/kg
- Aluminium Local Rod: ₹288/kg
- Aluminium Ingot: ₹319/kg
- Aluminium Wire Scrap: ₹273/kg
- Aluminium Bartan: ₹230/kg
- Aluminium Purja: ₹205/kg
- Aluminium Imported: ₹209/kg

### Lead
- PB-Soft: ₹181/kg
- PB-Hard: ₹191/kg
- PP/BT: ₹106.50/kg

### Zinc
- Zinc Ingot HZ: ₹321/kg
- Zinc Dross: ₹269/kg
- Zinc Tukda: ₹263/kg
- Zinc PMI: ₹291/kg
- Zinc Plant Pass: ₹303/kg
- Zinc 99.95: ₹327/kg

### Mild Steel (MS) - Converted from MT to kg
- MS Scrap Old: ₹32.1/kg (from ₹32,100/MT)
- MS Scrap New: ₹34.6/kg (from ₹34,600/MT)
- MS Ingot: ₹42.8/kg (from ₹42,800/MT)
- MS Billet: ₹42.9/kg (from ₹42,900/MT)

### Stainless Steel (SS)
- SS Mix MH: ₹57/kg
- SS 202: ₹59/kg
- SS 304: ₹113/kg
- SS 309: ₹193/kg
- SS 310: ₹296/kg
- SS 316: ₹213/kg

## Usage

```bash
cd SCRAPMATE-NODE-LAMBDA
node scripts/add-metal-subcategories.js
```

## How It Works

1. **Fetches existing subcategories**: Gets all metal subcategories from the database
2. **Compares with market rates**: Finds subcategories that don't exist in the database
3. **Calculates prices**: Sets prices at 20% less than market rates (market price × 0.8)
4. **Creates missing subcategories**: Adds new subcategories with calculated prices
5. **Updates existing subcategories**: Updates subcategories with missing or zero prices

## Price Calculation

- **Market Rate**: ₹100/kg
- **Database Price**: ₹80/kg (20% less)
- **Formula**: `price = marketPrice × 0.8`

## Output

The script provides detailed output:
- ✅ Created subcategories with their IDs and prices
- 🔄 Updated subcategories with old and new prices
- ❌ Errors (if any) with details
- 📊 Summary of all operations

## Example Output

```
🚀 Starting metal subcategory update process...

✅ Found metal category: Metal

📋 Fetching existing metal subcategories...
   Found 25 existing subcategories

🔍 Finding missing subcategories...
   Found 15 missing subcategories

➕ Creating missing subcategories...
✅ Created: Brass Local - ₹519.20/kg (Market: ₹649/kg)
✅ Created: Brass Chadri - ₹540.80/kg (Market: ₹676/kg)
...

🔄 Updating subcategories with missing prices...
🔄 Updated: Aluminium Company - ₹0 → ₹258.40/kg (Market: ₹323/kg)
...

📊 Summary:
   Total existing subcategories: 25
   Missing subcategories found: 15
   Subcategories created: 15
   Subcategories updated: 3
   Total errors: 0

✅ Process completed!
```

## Notes

- The script uses category ID `1` for Metal (this is the standard ID for metal category)
- All prices are stored as strings in the database
- Prices are rounded to 2 decimal places
- Subcategories are automatically approved (`approval_status: 'approved'`)
- The script is idempotent - running it multiple times won't create duplicates

## Updating Rates

To update the market rates in the script, edit the `MARKET_RATES` object in `add-metal-subcategories.js`:

```javascript
const MARKET_RATES = {
  'Brass Local': { price: 649, unit: 'kg' },
  // Add or update rates here
};
```

Then run the script again to update prices.

