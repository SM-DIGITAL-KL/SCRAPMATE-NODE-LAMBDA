const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../middleware/apiKeyMiddleware');

// Controllers
const AdminController = require('../controllers/adminPanelController');
const VendorController = require('../controllers/vendorPanelController');
const AgentController = require('../controllers/agentPanelController');
const CustomerController = require('../controllers/customerPanelController');
const StudentController = require('../controllers/studentPanelController');
const SubSchoolController = require('../controllers/subSchoolPanelController');
const CourseController = require('../controllers/coursePanelController');
const StoreController = require('../controllers/storePanelController');
const ExamController = require('../controllers/examPanelController');
const ReportController = require('../controllers/reportPanelController');
const SiteController = require('../controllers/sitePanelController');
const AccountsController = require('../controllers/accountsPanelController');
const ShopController = require('../controllers/shopController');
const SubscriptionPackageController = require('../controllers/subscriptionPackageController');

// Log all requests to admin panel API routes - MUST BE FIRST
router.use((req, res, next) => {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📥📥📥 ADMIN PANEL API ROUTE HIT 📥📥📥');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Method:', req.method);
  console.log('   Path:', req.path);
  console.log('   Full URL:', req.originalUrl || req.url);
  console.log('   Query params:', JSON.stringify(req.query));
  console.log('   Params:', JSON.stringify(req.params));
  console.log('   Headers api-key:', req.headers['api-key'] ? 'Present' : 'MISSING');
  console.log('   Body:', req.method === 'POST' || req.method === 'PUT' ? { ...req.body, password: req.body?.password ? '***' : undefined } : 'N/A');
  console.log('   Timestamp:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════');
  next();
});

// All admin panel API routes require API key
router.use(apiKeyCheck);

// ==================== ADMIN ROUTES ====================
// Dashboard endpoints (chunked for better performance)
router.get('/admin/dashboard/kpis', AdminController.dashboardKPIs);
router.get('/admin/dashboard/charts', AdminController.dashboardCharts);
router.get('/admin/dashboard/recent-orders', AdminController.dashboardRecentOrders);
router.get('/admin/dashboard/call-logs', AdminController.dashboardCallLogs);
// Legacy dashboard endpoint (kept for backward compatibility)
router.get('/admin/dashboard', AdminController.dashboard);
router.get('/admin/b2b-users', AdminController.b2bUsers);
router.get('/admin/b2b-users/:userId', AdminController.getB2BUserDetails);
router.post('/admin/b2b-users/:userId/approval-status', AdminController.updateB2BApprovalStatus);
router.get('/admin/users', AdminController.users);
router.get('/admin/users/:id', AdminController.getUserById);
router.delete('/admin/users/:id', AdminController.deleteUser);
router.get('/admin/view_users', AdminController.viewUsers);
router.post('/admin/manage_users', AdminController.manageUsers);
router.post('/admin/manage_users/:id', AdminController.manageUsers);
router.post('/admin/user_password_reset/:id', AdminController.userPasswordReset);
router.get('/admin/set_permission', AdminController.setPermission);
router.get('/admin/set_permission/:id', AdminController.setPermission);
router.post('/admin/store_user_per', AdminController.storeUserPermission);
router.post('/admin/check_distance', AdminController.checkDistance);
router.get('/admin/callLogSearch', AdminController.callLogSearch);
router.get('/admin/getcallLogSearch', AdminController.getcallLogSearch);
router.get('/admin/signUpReport', AdminController.signUpReport);
router.get('/admin/custNotification', AdminController.custNotification);
router.get('/admin/vendorNotification', AdminController.vendorNotification);
router.post('/admin/sendCustNotification', AdminController.sendCustNotification);
router.post('/admin/sendVendorNotification', AdminController.sendVendorNotification);

// ==================== VENDOR ROUTES ====================
router.get('/vendor/list', VendorController.vendors);
router.get('/vendor/:id', VendorController.getVendorById);
router.post('/vendor', VendorController.createVendor);
router.put('/vendor/:id', VendorController.updateVendor);
router.delete('/vendor/:id', VendorController.deleteVendor);

// ==================== AGENT ROUTES ====================
// IMPORTANT: Specific routes must come BEFORE parameterized routes (:id)
router.get('/agent/list', AgentController.agents);
router.get('/agent/leads', AgentController.agentsLeads);
router.get('/agent/shops', AgentController.viewShops);
router.get('/agent/report', AgentController.agentReport);
router.get('/agent/commission-track', AgentController.commissionTrack);
router.get('/agent/shop/:id', AgentController.shopViewById);
router.get('/agent/delivery-boy/:id', AgentController.viewDeliveryBoy);
router.get('/agent/categories/:id', AgentController.getCategoriesForShop);
router.get('/agent/shop-images/:id', ShopController.shopImageList);
router.post('/agent', AgentController.createAgent);
router.post('/agent/category/:id', AgentController.createCategory);
router.post('/agent/item/:shopid/:catid', AgentController.createItem);
router.put('/agent/shop-status/:id', AgentController.shopStatusChange);
router.delete('/agent/shop/:id', AgentController.deleteShop);
// Parameterized routes (:id) must come LAST
router.get('/agent/:id', AgentController.getAgentById);
router.put('/agent/:id', AgentController.updateAgent);

// ==================== CUSTOMER ROUTES ====================
// IMPORTANT: Specific routes must come BEFORE parameterized routes (:id)
router.get('/customer/list', CustomerController.customers);
router.get('/customer/orders', CustomerController.orders);
router.get('/customer/view-customers', CustomerController.viewCustomers);
router.get('/customer/view-orders', CustomerController.viewOrders);
router.get('/customer/recent-orders', CustomerController.showRecentOrders);
router.get('/customer/recent-orders/:id', CustomerController.showRecentOrders);
router.get('/customer/order/:id', CustomerController.viewOrderDetails);
router.delete('/customer/:id', CustomerController.deleteCustomer);
// Parameterized routes (:id) must come LAST
router.get('/customer/:id', CustomerController.getCustomerById);

// ==================== STUDENT ROUTES ====================
router.get('/student/list', StudentController.students);
router.get('/student/:id', StudentController.getStudentById);
router.get('/student/payment', StudentController.studentPayment);
router.get('/student/activation', StudentController.studentActivation);
router.post('/student', StudentController.createStudent);
router.put('/student/:id', StudentController.updateStudent);

// ==================== SUBSCHOOL ROUTES ====================
router.get('/subschool/list', SubSchoolController.subschools);
router.get('/subschool/:id', SubSchoolController.getSubschoolById);
router.post('/subschool', SubSchoolController.createSubschool);
router.put('/subschool/:id', SubSchoolController.updateSubschool);

// ==================== COURSE ROUTES ====================
router.get('/course/categories', CourseController.coursesCategory);
router.get('/course/list', CourseController.courses);
router.get('/course/:id', CourseController.getCourseById);
router.get('/course/report', CourseController.courseReport);
router.get('/course/sub-topics', CourseController.subTopicList);
router.get('/course/videos', CourseController.videos);
router.get('/course/notes', CourseController.notes);
router.get('/course/audios', CourseController.audios);
router.get('/course/assignment', CourseController.assignment);
router.post('/course/category', CourseController.createCategory);
router.post('/course', CourseController.createCourse);
router.put('/course/:id', CourseController.updateCourse);
router.post('/course/subject', CourseController.createSubject);
router.post('/course/topic', CourseController.createTopic);
router.post('/course/video', CourseController.createVideo);
router.post('/course/note', CourseController.createNote);
router.post('/course/audio', CourseController.createAudio);
router.post('/course/assignment', CourseController.createAssignment);

// ==================== STORE ROUTES ====================
router.get('/store/categories', StoreController.storeCategory);
router.get('/store/category/:id', StoreController.getStoreCategoryById);
router.get('/store/view-categories', StoreController.viewStoreCategory);
router.get('/store/report', StoreController.storeReport);
router.get('/store/list', StoreController.stores);
router.get('/store/:id', StoreController.getStoreById);
router.post('/store/category', StoreController.createStoreCategory);
router.put('/store/category/:id', StoreController.updateStoreCategory);
router.delete('/store/category/:id', StoreController.deleteStoreCategory);
router.post('/store', StoreController.createStore);
router.post('/store/product', StoreController.createProduct);

// ==================== EXAM ROUTES ====================
router.get('/exam/list', ExamController.exams);
router.get('/exam/:id', ExamController.getExamById);
router.get('/exam/questions', ExamController.questions);
router.get('/exam/assessment', ExamController.assessment);
router.post('/exam', ExamController.createExam);
router.put('/exam/:id', ExamController.updateExam);
router.post('/exam/question', ExamController.createQuestion);
router.put('/exam/question/:id', ExamController.updateQuestion);
router.post('/exam/import-questions', ExamController.importQuestions);

// ==================== REPORT ROUTES ====================
router.get('/report', ReportController.report);

// ==================== SITE ROUTES ====================
router.get('/site', SiteController.getSite);
router.put('/site', SiteController.updateSite);
router.get('/site/app-version', SiteController.getAppVersion);
router.put('/site/app-version', SiteController.updateAppVersion);

// ==================== ACCOUNTS ROUTES ====================
router.get('/accounts/sub-packages', AccountsController.subPackages);
router.get('/accounts/sub-package/:id', AccountsController.getSubPackageById);
router.get('/accounts/subscribers', AccountsController.subscribersList);
router.get('/accounts/view-subscribers', AccountsController.viewSubscribersList);
router.post('/accounts/sub-package', AccountsController.createSubPackage);
router.put('/accounts/sub-package/:id', AccountsController.updateSubPackage);
router.delete('/accounts/sub-package/:id', AccountsController.deleteSubPackage);
router.put('/accounts/sub-package-status', AccountsController.updateSubPackageStatus);

// ==================== SUBSCRIPTION PACKAGES ROUTES ====================
router.get('/subscription-packages', SubscriptionPackageController.getSubscriptionPackages);
router.get('/subscription-packages/:id', SubscriptionPackageController.getSubscriptionPackageById);
router.post('/subscription-packages', SubscriptionPackageController.upsertSubscriptionPackage);
router.put('/subscription-packages/:id', SubscriptionPackageController.updateSubscriptionPackage);
router.delete('/subscription-packages/:id', SubscriptionPackageController.deleteSubscriptionPackage);

module.exports = router;

