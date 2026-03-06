#!/usr/bin/env node

/**
 * Apply zone mapping to district_pincode_prefixes table.
 *
 * Writes:
 * - zone_no
 * - zone_name
 * - zone_group
 * - zone_code (e.g. Z01)
 *
 * Usage:
 *   node scripts/apply-district-zones.js
 *   node scripts/apply-district-zones.js --apply
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();
const fs = require('fs');
const path = require('path');

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'district_pincode_prefixes';

const GROUP_NAMES = {
  1: 'North & Ganga Belt',
  2: 'East & Northeast',
  3: 'West & Central',
  4: 'South'
};

function n(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function makeSet(arr) {
  return new Set(arr.map(n));
}

const STATES = {
  ASSAM: makeSet(['Assam']),
  ARUNACHAL: makeSet(['Arunachal Pradesh']),
  MANIPUR: makeSet(['Manipur']),
  MEGHALAYA: makeSet(['Meghalaya']),
  MIZORAM: makeSet(['Mizoram']),
  NAGALAND: makeSet(['Nagaland']),
  TRIPURA: makeSet(['Tripura']),
  SIKKIM: makeSet(['Sikkim']),
  JHARKHAND: makeSet(['Jharkhand']),
  ODISHA: makeSet(['Odisha', 'Orissa']),
  CHHATTISGARH: makeSet(['Chhattisgarh']),
  UTTARAKHAND: makeSet(['Uttarakhand']),
  HIMACHAL: makeSet(['Himachal Pradesh']),
  HARYANA: makeSet(['Haryana']),
  DELHI: makeSet(['Delhi']),
  JK: makeSet(['Jammu and Kashmir', 'Jammu & Kashmir']),
  LADAKH: makeSet(['Ladakh']),
  PUNJAB: makeSet(['Punjab']),
  KERALA: makeSet(['Kerala']),
  TELANGANA: makeSet(['Telangana']),
  KARNATAKA: makeSet(['Karnataka']),
  TAMILNADU: makeSet(['Tamil Nadu']),
  AP: makeSet(['Andhra Pradesh']),
  BIHAR: makeSet(['Bihar']),
  UP: makeSet(['Uttar Pradesh']),
  WESTBENGAL: makeSet(['West Bengal']),
  RAJASTHAN: makeSet(['Rajasthan']),
  GUJARAT: makeSet(['Gujarat']),
  MAHARASHTRA: makeSet(['Maharashtra']),
  MP: makeSet(['Madhya Pradesh']),
  LAKSHADWEEP: makeSet(['Lakshadweep'])
};

function inState(stateNorm, stateSet) {
  return stateSet.has(stateNorm);
}

const Z = {
  z1: makeSet(['Saharanpur', 'Muzaffarnagar', 'Shamli', 'Baghpat', 'Meerut', 'Ghaziabad', 'Hapur']),
  z2: makeSet(['Gautam Buddha Nagar', 'Bulandshahr', 'Aligarh', 'Mathura', 'Hathras', 'Agra']),
  z3: makeSet(['Bareilly', 'Badaun', 'Shahjahanpur', 'Pilibhit', 'Rampur', 'Moradabad', 'Sambhal', 'Amroha', 'Bijnor']),
  z4: makeSet(['Firozabad', 'Mainpuri', 'Etah', 'Kasganj', 'Farrukhabad', 'Kannauj', 'Etawah', 'Auraiya', 'Kanpur Dehat']),
  z5: makeSet(['Lucknow', 'Unnao', 'Rae Bareli', 'Sitapur', 'Hardoi', 'Lakhimpur Kheri']),
  z6: makeSet(['Ayodhya', 'Barabanki', 'Sultanpur', 'Amethi', 'Gonda', 'Bahraich', 'Shravasti', 'Balrampur']),
  z7: makeSet(['Gorakhpur', 'Deoria', 'Kushinagar', 'Maharajganj', 'Basti', 'Siddharthnagar', 'Sant Kabir Nagar']),
  z8: makeSet(['Varanasi', 'Ghazipur', 'Jaunpur', 'Chandauli', 'Mirzapur', 'Sonbhadra', 'Sant Ravidas Nagar', 'Azamgarh', 'Mau', 'Ballia']),
  z9: makeSet(['West Champaran', 'East Champaran', 'Muzaffarpur', 'Sheohar', 'Vaishali']),
  z10: makeSet(['Darbhanga', 'Madhubani', 'Samastipur', 'Sitamarhi', 'Begusarai', 'Khagaria']),
  z11: makeSet(['Purnia', 'Katihar', 'Araria', 'Kishanganj', 'Saharsa', 'Madhepura', 'Supaul', 'Bhagalpur', 'Banka']),
  z12: makeSet(['Patna', 'Gaya', 'Jehanabad', 'Nalanda', 'Nawada', 'Arwal', 'Bhojpur', 'Buxar', 'Kaimur', 'Rohtas', 'Saran', 'Siwan', 'Gopalganj', 'Munger', 'Jamui', 'Lakhisarai', 'Sheikhpura', 'Aurangabad']),
  z13extra: makeSet(['Sonipat', 'Panipat', 'Rohtak', 'Jhajjar', 'Gurgaon', 'Faridabad', 'Rewari', 'Palwal']),
  z14punjab: makeSet(['Amritsar', 'Gurdaspur', 'Pathankot', 'Tarn Taran', 'Kapurthala', 'Jalandhar', 'Ludhiana']),
  z15: makeSet(['Darjeeling', 'Kalimpong', 'Jalpaiguri', 'Alipurduar', 'Cooch Behar', 'North Dinajpur', 'South Dinajpur', 'Malda', 'Murshidabad']),
  z16: makeSet(['Kolkata', 'Howrah', 'South 24 Parganas']),
  z17: makeSet(['North 24 Parganas', 'Nadia', 'Hooghly']),
  z18: makeSet(['Purba Medinipur', 'Paschim Medinipur', 'Jhargram', 'Bankura', 'Purulia', 'Birbhum', 'Paschim Bardhaman', 'Purba Bardhaman']),
  z19: makeSet(['Ranchi', 'Khunti', 'Lohardaga', 'Gumla', 'Simdega', 'Hazaribagh', 'Ramgarh', 'Koderma', 'Giridih', 'Bokaro', 'Dhanbad']),
  z20: makeSet(['East Singhbhum', 'West Singhbhum', 'Seraikela Kharsawan', 'Palamu', 'Garhwa', 'Latehar', 'Chatra', 'Deoghar', 'Dumka', 'Godda', 'Sahibganj', 'Pakur', 'Jamtara']),
  z21: makeSet(['Angul', 'Balasore', 'Bhadrak', 'Cuttack', 'Dhenkanal', 'Jajpur', 'Jagatsinghpur', 'Kendrapada', 'Khordha', 'Mayurbhanj', 'Nayagarh', 'Puri']),
  z23: makeSet(['Jodhpur', 'Bikaner', 'Jaisalmer', 'Barmer', 'Pali', 'Jalore', 'Sirohi', 'Nagaur']),
  z24: makeSet(['Udaipur', 'Bhilwara', 'Ajmer', 'Chittorgarh', 'Rajsamand', 'Dungarpur', 'Banswara', 'Pratapgarh', 'Tonk', 'Bundi', 'Kota', 'Baran', 'Jhalawar']),
  z25: makeSet(['Jaipur', 'Alwar', 'Sikar', 'Jhunjhunu', 'Churu', 'Hanumangarh', 'Ganganagar', 'Dausa', 'Karauli', 'Sawai Madhopur', 'Bharatpur', 'Dholpur']),
  z26: makeSet(['Ahmedabad', 'Gandhinagar', 'Mehsana', 'Banaskantha', 'Sabarkantha', 'Patan', 'Aravalli', 'Mahisagar', 'Kheda', 'Anand', 'Vadodara', 'Panchmahal', 'Dahod', 'Chhotaudepur']),
  z27: makeSet(['Rajkot', 'Jamnagar', 'Bhavnagar', 'Junagadh', 'Kutch', 'Amreli', 'Surendranagar', 'Morbi', 'Devbhumi Dwarka', 'Gir Somnath', 'Botad', 'Porbandar', 'Surat', 'Bharuch', 'Narmada', 'Tapi', 'Dang', 'Navsari', 'Valsad']),
  z28: makeSet(['Mumbai City', 'Mumbai Suburban']),
  z29: makeSet(['Thane', 'Palghar', 'Raigad', 'Ratnagiri', 'Sindhudurg']),
  z30: makeSet(['Pune', 'Satara', 'Sangli', 'Solapur', 'Kolhapur']),
  z31: makeSet(['Nagpur', 'Wardha', 'Bhandara', 'Gondia', 'Chandrapur', 'Gadchiroli', 'Amravati', 'Akola', 'Yavatmal', 'Buldhana', 'Washim', 'Aurangabad', 'Jalna', 'Parbhani', 'Hingoli', 'Nanded', 'Beed', 'Latur', 'Osmanabad', 'Nashik', 'Ahmednagar', 'Jalgaon', 'Dhule', 'Nandurbar']),
  z32: makeSet(['Indore', 'Ujjain', 'Dewas', 'Dhar', 'Ratlam', 'Mandsaur', 'Neemuch', 'Shajapur', 'Agar Malwa', 'Khargone', 'Khandwa', 'Barwani', 'Burhanpur', 'Alirajpur', 'Jhabua']),
  z33: makeSet(['Gwalior', 'Shivpuri', 'Gunna', 'Datia', 'Ashoknagar', 'Bhind', 'Morena', 'Sheopur', 'Sagar', 'Tikamgarh', 'Niwari', 'Chhatarpur', 'Panna', 'Damoh', 'Rewa', 'Satna', 'Sidhi', 'Singrauli']),
  z34: makeSet(['Bhopal', 'Sehore', 'Raisen', 'Vidisha', 'Rajgarh', 'Jabalpur', 'Katni', 'Narsinghpur', 'Chhindwara', 'Seoni', 'Mandla', 'Balaghat', 'Dindori', 'Shahdol', 'Umaria', 'Anuppur', 'Hoshangabad', 'Betul', 'Harda']),
  z35odisha: makeSet(['Bolangir', 'Kalahandi', 'Koraput', 'Sambalpur', 'Bargarh', 'Jharsuguda', 'Sundargarh', 'Malkangiri', 'Nabarangapur', 'Nuapada', 'Deogarh', 'Boudh', 'Ganjam', 'Rayagada', 'Gajapati', 'Kandhamal']),
  z36har: makeSet(['Ambala', 'Yamunanagar', 'Kurukshetra', 'Kaithal', 'Hisar', 'Bhiwani', 'Sirsa', 'Karnal', 'Panchkula', 'Fatehabad', 'Jind']),
  z37: makeSet(['Srikakulam', 'Vizianagaram', 'Visakhapatnam', 'East Godavari', 'West Godavari', 'Krishna']),
  z38: makeSet(['Guntur', 'Prakasam', 'Nellore', 'Chittoor', 'Kadapa', 'Anantapur', 'Kurnool']),
  z39: makeSet(['Hyderabad', 'Rangareddy', 'Medchal-Malkajgiri', 'Vikarabad', 'Medchal Malkajgiri']),
  z41: makeSet(['Bangalore Urban', 'Bengaluru Urban']),
  z42: makeSet(['Bangalore Rural', 'Ramanagara', 'Chikkaballapur', 'Kolar', 'Tumakuru', 'Mysuru', 'Mandya', 'Chamarajanagar', 'Hassan', 'Kodagu', 'Dakshina Kannada', 'Udupi', 'Chikkamagaluru']),
  z43: makeSet(['Belagavi', 'Bagalkot', 'Vijayapura', 'Kalaburagi', 'Yadgir', 'Raichur', 'Koppal', 'Gadag', 'Dharwad', 'Uttara Kannada', 'Haveri', 'Shivamogga', 'Davanagere', 'Ballari', 'Chitradurga', 'Bidar']),
  z44: makeSet(['Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha', 'Kottayam', 'Idukki', 'Ernakulam']),
  z45: makeSet(['Thrissur', 'Palakkad', 'Malappuram', 'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod']),
  z46: makeSet(['Coimbatore', 'Tiruppur', 'Erode', 'Nilgiris', 'Salem', 'Namakkal', 'Dharmapuri', 'Krishnagiri', 'Vellore', 'Tirupathur', 'Ranipet', 'Tiruvannamalai']),
  z47: makeSet(['Chennai', 'Tiruvallur', 'Kanchipuram', 'Chengalpattu', 'Viluppuram', 'Kallakurichi', 'Cuddalore']),
  z48: makeSet(['Madurai', 'Dindigul', 'Theni', 'Virudhunagar', 'Sivaganga', 'Ramanathapuram', 'Thoothukudi', 'Tuticorin', 'Tirunelveli', 'Tenkasi', 'Kanyakumari', 'Tiruchirappalli', 'Karur', 'Perambalur', 'Ariyalur', 'Pudukkottai', 'Thanjavur', 'Tiruvarur', 'Nagapattinam', 'Mayiladuthurai'])
};

const DISTRICT_ALIASES = new Map(
  Object.entries({
    // UP/Bihar/WB/TN/KA/GJ/Odisha aliases
    budaun: 'badaun',
    santkabeernagar: 'santkabirnagar',
    bhadohi: 'santravidasnagar',
    kheri: 'lakhimpurkheri',
    pashchimchamparan: 'westchamparan',
    purbichamparan: 'eastchamparan',
    kaimurbhabua: 'kaimur',
    coochbehar: 'coochbehar',
    dinajpurdakshin: 'southdinajpur',
    dinajpuruttar: 'northdinajpur',
    medinipureast: 'purbamedinipur',
    medinipurwest: 'paschimmedinipur',
    maldah: 'malda',
    '24paraganasnorth': 'north24parganas',
    '24paraganassouth': 'south24parganas',
    villupuram: 'viluppuram',
    thiruvallur: 'tiruvallur',
    thiruvarur: 'tiruvarur',
    kanniyakumari: 'kanyakumari',
    thenilgiris: 'nilgiris',
    mayiladuthurai: 'mayiladuthurai',
    bengalururural: 'bangalorerural',
    chikkaballapura: 'chikkaballapur',
    chamarajanagara: 'chamarajanagar',
    davangere: 'davanagere',
    vijaynagar: 'ballari',
    ahmadabad: 'ahmedabad',
    mahesana: 'mehsana',
    arvalli: 'aravalli',
    panchmahals: 'panchmahal',
    dohad: 'dahod',
    chhotaudepur: 'chhotaudepur',
    kachchh: 'kutch',
    anugul: 'angul',
    baleshwar: 'balasore',
    jagatsinghapur: 'jagatsinghpur',
    kendujhar: 'keonjhar',
    balangir: 'bolangir',
    sonepur: 'subarnapur',
    kendrapara: 'kendrapada',
    eastsinghbum: 'eastsinghbhum',
    eastsinghbhum: 'eastsinghbhum',
    saraikelakharsawan: 'seraikelakharsawan',
    sahebganj: 'sahibganj',
    gurugram: 'gurgaon',
    mahendragarh: 'rewari',
    mumbai: 'mumbaicity',
    // AP new districts
    ntr: 'krishna',
    eluru: 'westgodavari',
    kakinada: 'eastgodavari',
    konaseema: 'eastgodavari',
    anakapalli: 'visakhapatnam',
    parvathipurammanyam: 'vizianagaram',
    ysr: 'kadapa',
    nandyal: 'kurnool',
    tirupati: 'chittoor',
    annamayya: 'chittoor',
    spsrnellore: 'nellore',
    allurisitharamaraju: 'visakhapatnam',
    palnadu: 'guntur',
    bapatla: 'guntur',
    visakhapatanam: 'visakhapatnam',
    srisathyasai: 'anantapur',
    jajapur: 'jajpur',
    sambalpur: 'sambalpur',
    bargarh: 'bargarh',
    malkangiri: 'malkangiri',
    deogarh: 'deogarh',
    gajapati: 'gajapati',
    jharsuguda: 'jharsuguda',
    sundargarh: 'sundargarh',
    nabarangpur: 'nabarangapur',
    kandhamal: 'kandhamal',
    nuapada: 'nuapada',
    rayagada: 'rayagada',
    boudh: 'boudh',
    kendujhar: 'keonjhar',
    kaushambi: 'kaushambi',
    ambedkarnagar: 'ambedkarnagar',
    kanpurnagar: 'kanpurnagar',
    eastnimar: 'khandwa',
    guna: 'gunna',
    charkidadri: 'charkhidadri'
  })
);

const STATE_ALIASES = new Map(
  Object.entries({
    'jammuandkashmir': 'jammuandkashmir',
    'jammuandkashmirut': 'jammuandkashmir',
    'thedadraandnagarhavelianddamananddiu': 'dadraandnagarhavelianddamananddiu',
    'dadraandnagarhavelianddamananddiu': 'dadraandnagarhavelianddamananddiu'
  })
);

const UP_EXTRA_Z4 = makeSet(['Kanpur Nagar', 'Fatehpur', 'Jalaun', 'Jhansi', 'Lalitpur', 'Hamirpur', 'Mahoba', 'Banda', 'Chitrakoot']);
const UP_EXTRA_Z6 = makeSet(['Ambedkar Nagar', 'Pratapgarh']);
const UP_EXTRA_Z8 = makeSet(['Prayagraj', 'Kaushambi']);
const HARYANA_EXTRA_Z13 = makeSet(['Nuh', 'Charkhi Dadri', 'Charki Dadri']);

function aliasState(s) {
  return STATE_ALIASES.get(s) || s;
}

function aliasDistrict(d) {
  return DISTRICT_ALIASES.get(d) || d;
}

function zoneFor(stateName, districtName) {
  const s = aliasState(n(stateName));
  const d = aliasDistrict(n(districtName));
  if (!d || d === 'alldistricts' || s === n('NA') || d === n('NA')) return null;

  const inUP = inState(s, STATES.UP);
  const inBihar = inState(s, STATES.BIHAR);
  const inWB = inState(s, STATES.WESTBENGAL);
  const inJh = inState(s, STATES.JHARKHAND);
  const inOd = inState(s, STATES.ODISHA);
  const inRj = inState(s, STATES.RAJASTHAN);
  const inGj = inState(s, STATES.GUJARAT);
  const inMh = inState(s, STATES.MAHARASHTRA);
  const inMp = inState(s, STATES.MP);
  const inAp = inState(s, STATES.AP);
  const inTg = inState(s, STATES.TELANGANA);
  const inKa = inState(s, STATES.KARNATAKA);
  const inKl = inState(s, STATES.KERALA);
  const inTn = inState(s, STATES.TAMILNADU);

  if (inUP && Z.z1.has(d)) return [1, 'West UP A', 1];
  if (inUP && Z.z2.has(d)) return [2, 'West UP B', 1];
  if (inUP && Z.z3.has(d)) return [3, 'Rohilkhand', 1];
  if (inUP && (Z.z4.has(d) || UP_EXTRA_Z4.has(d))) return [4, 'Central Doab', 1];
  if (inUP && Z.z5.has(d)) return [5, 'Awadh West', 1];
  if (inUP && (Z.z6.has(d) || UP_EXTRA_Z6.has(d))) return [6, 'Awadh East', 1];
  if (inUP && Z.z7.has(d)) return [7, 'Purvanchal North', 1];
  if (inUP && (Z.z8.has(d) || UP_EXTRA_Z8.has(d))) return [8, 'Purvanchal South', 1];

  if (inBihar && Z.z9.has(d)) return [9, 'Tirhut', 1];
  if (inBihar && Z.z10.has(d)) return [10, 'Mithila', 1];
  if (inBihar && Z.z11.has(d)) return [11, 'Seemanchal', 1];
  if (inBihar && Z.z12.has(d)) return [12, 'Magadh/South Bihar', 1];

  if (inState(s, STATES.DELHI) || (inState(s, STATES.HARYANA) && Z.z13extra.has(d))) return [13, 'NCR & Haryana', 1];
  if (inState(s, STATES.JK) || inState(s, STATES.LADAKH) || (inState(s, STATES.PUNJAB) && Z.z14punjab.has(d))) return [14, 'NW Border', 1];

  if (inWB && Z.z15.has(d)) return [15, 'North Bengal', 2];
  if (inWB && Z.z16.has(d)) return [16, 'Kolkata & Delta', 2];
  if (inWB && Z.z17.has(d)) return [17, 'Rarh Bengal', 2];
  if (inWB && Z.z18.has(d)) return [18, 'West Bengal Plains', 2];
  if (inJh && Z.z19.has(d)) return [19, 'Jharkhand North', 2];
  if (inJh && Z.z20.has(d)) return [20, 'Jharkhand South', 2];
  if (inOd && Z.z21.has(d)) return [21, 'Odisha North/Central', 2];
  if (inState(s, STATES.ASSAM) || inState(s, STATES.ARUNACHAL) || inState(s, STATES.MANIPUR) || inState(s, STATES.MEGHALAYA) || inState(s, STATES.MIZORAM) || inState(s, STATES.NAGALAND) || inState(s, STATES.TRIPURA) || inState(s, STATES.SIKKIM)) return [22, 'NE Mega-Zone', 2];

  if (inRj && Z.z23.has(d)) return [23, 'Marwar', 3];
  if (inRj && Z.z24.has(d)) return [24, 'Mewar/Ajmer', 3];
  if (inRj && Z.z25.has(d)) return [25, 'Dhundhar/Shekhawati', 3];
  if (inGj && Z.z26.has(d)) return [26, 'Gujarat North/Central', 3];
  if (inGj && Z.z27.has(d)) return [27, 'Saurashtra/South', 3];
  if (inMh && Z.z28.has(d)) return [28, 'Mumbai Core', 3];
  if (inMh && Z.z29.has(d)) return [29, 'Thane/Konkan', 3];
  if (inMh && Z.z30.has(d)) return [30, 'Pune/Western Maha', 3];
  if (inMh && Z.z31.has(d)) return [31, 'Vidarbha/Marathwada', 3];
  if (inMp && Z.z32.has(d)) return [32, 'Malwa', 3];
  if (inMp && Z.z33.has(d)) return [33, 'Gwalior/Chambal/Bundelkhand', 3];
  if (inMp && Z.z34.has(d)) return [34, 'Central MP', 3];
  if (inState(s, STATES.CHHATTISGARH) || (inOd && Z.z35odisha.has(d)) || (inOd && makeSet(['Subarnapur']).has(d))) return [35, 'Chhattisgarh', 3];
  if (inState(s, STATES.UTTARAKHAND) || inState(s, STATES.HIMACHAL) || (inState(s, STATES.HARYANA) && Z.z36har.has(d))) return [36, 'Himalayan North', 3];
  if (inState(s, STATES.HARYANA) && HARYANA_EXTRA_Z13.has(d)) return [13, 'NCR & Haryana', 1];

  if (inAp && Z.z37.has(d)) return [37, 'Andhra North', 4];
  if (inAp && Z.z38.has(d)) return [38, 'Andhra South/Rayalaseema', 4];
  if (inTg && Z.z39.has(d)) return [39, 'Hyderabad Metro', 4];
  if (inTg) return [40, 'Telangana Rural', 4];
  if (inKa && Z.z41.has(d)) return [41, 'Bangalore Urban', 4];
  if (inKa && Z.z42.has(d)) return [42, 'Karnataka South', 4];
  if (inKa && Z.z43.has(d)) return [43, 'Karnataka North', 4];
  if (inKl && Z.z44.has(d)) return [44, 'Kerala South', 4];
  if ((inKl && Z.z45.has(d)) || inState(s, STATES.LAKSHADWEEP)) return [45, 'Kerala North', 4];
  if (inTn && Z.z46.has(d)) return [46, 'TN West/North', 4];
  if (inTn && Z.z47.has(d)) return [47, 'Chennai/Coastal', 4];
  if (inTn && Z.z48.has(d)) return [48, 'TN South', 4];

  // Additional practical fallbacks for unmatched but known regions/UTs.
  if (inState(s, STATES.PUNJAB)) return [14, 'NW Border', 1];
  if (s === n('Chandigarh')) return [13, 'NCR & Haryana', 1];
  if (s === n('Goa')) return [29, 'Thane/Konkan', 3];
  if (s === n('Puducherry')) {
    if (d === n('mahe')) return [45, 'Kerala North', 4];
    if (d === n('yanam')) return [37, 'Andhra North', 4];
    return [47, 'Chennai/Coastal', 4];
  }
  if (s === n('Andaman and Nicobar Islands')) return [22, 'NE Mega-Zone', 2];
  if (s === n('dadra and nagar haveli and daman and diu')) return [27, 'Saurashtra/South', 3];

  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const showUnmapped = process.argv.includes('--show-unmapped');
  const client = getDynamoDBClient();

  let lastKey = null;
  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let unmapped = 0;
  const unmappedRows = [];

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'} | Table: ${TABLE_NAME}`);

  do {
    const scanParams = {
      TableName: TABLE_NAME,
      ProjectionExpression: 'id, state_name, district_name, zone_no, zone_name, zone_group'
    };
    if (lastKey) {
      scanParams.ExclusiveStartKey = lastKey;
    }
    const res = await client.send(new ScanCommand(scanParams));

    for (const it of res.Items || []) {
      scanned += 1;
      const z = zoneFor(it.state_name, it.district_name);
      if (!z) {
        unmapped += 1;
        unmappedRows.push({
          id: it.id,
          state_name: it.state_name || '',
          district_name: it.district_name || ''
        });
        if (showUnmapped) {
          console.log(`⚠️ UNMAPPED ${it.state_name} / ${it.district_name}`);
        }
        continue;
      }
      matched += 1;
      const [zoneNo, zoneName, zoneGroup] = z;
      const unchanged =
        Number(it.zone_no || 0) === zoneNo &&
        String(it.zone_name || '') === zoneName &&
        Number(it.zone_group || 0) === zoneGroup;
      if (unchanged) continue;

      if (apply) {
        await client.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: it.id },
            UpdateExpression:
              'SET zone_no = :zone_no, zone_name = :zone_name, zone_group = :zone_group, zone_group_name = :zone_group_name, zone_code = :zone_code, updated_at = :updated_at',
            ExpressionAttributeValues: {
              ':zone_no': zoneNo,
              ':zone_name': zoneName,
              ':zone_group': zoneGroup,
              ':zone_group_name': GROUP_NAMES[zoneGroup] || '',
              ':zone_code': `Z${String(zoneNo).padStart(2, '0')}`,
              ':updated_at': new Date().toISOString()
            }
          })
        );
      }
      updated += 1;
      console.log(`${apply ? '✅' : '🧪'} ${it.state_name} / ${it.district_name} -> Z${zoneNo} ${zoneName}`);
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log('\nDone');
  const summary = {
    table: TABLE_NAME,
    mode: apply ? 'apply' : 'dry_run',
    scanned,
    matched,
    updated,
    unmapped
  };
  console.log(JSON.stringify(summary, null, 2));

  const report = {
    generated_at: new Date().toISOString(),
    summary,
    unmapped_rows: unmappedRows
  };
  const reportPath = path.join(
    __dirname,
    `apply-district-zones-unmapped-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`📁 Unmapped report: ${reportPath}`);
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
