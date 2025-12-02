const express = require('express');
const router = express.Router();

// Controllers
const WebLoginController = require('../controllers/webLoginController');
const AdminPanelController = require('../controllers/adminPanelController');
const VendorPanelController = require('../controllers/vendorPanelController');
const AgentPanelController = require('../controllers/agentPanelController');
const StudentPanelController = require('../controllers/studentPanelController');
const SubSchoolPanelController = require('../controllers/subSchoolPanelController');
const CoursePanelController = require('../controllers/coursePanelController');
const StorePanelController = require('../controllers/storePanelController');
const ExamPanelController = require('../controllers/examPanelController');
const ReportPanelController = require('../controllers/reportPanelController');
const SitePanelController = require('../controllers/sitePanelController');
const CustomerPanelController = require('../controllers/customerPanelController');
const AccountsPanelController = require('../controllers/accountsPanelController');
const ShopController = require('../controllers/shopController');

// Middleware
const { authenticateWebUser } = require('../middleware/webAuthMiddleware');

// ==================== LOGIN ROUTES (No Auth Required) ====================
router.get('/', WebLoginController.login);
router.get('/login', WebLoginController.login);
router.get('/logout', WebLoginController.logout);
router.all('/dologin', WebLoginController.doLogin);

// ==================== PROTECTED ROUTES (Require Authentication) ====================
router.use(authenticateWebUser);

// ==================== ADMIN CONTROLLER ROUTES ====================
router.get('/admin/dashboard', AdminPanelController.dashboard);
router.get('/admin/b2b-users', AdminPanelController.b2bUsers);
router.get('/admin/b2b-users/:userId', AdminPanelController.getB2BUserDetails);
router.post('/admin/b2b-users/:userId/approval-status', AdminPanelController.updateB2BApprovalStatus);
router.get('/admin/b2c-users', AdminPanelController.b2cUsers);
router.get('/admin/b2c-users/:userId', AdminPanelController.getB2CUserDetails);
router.post('/admin/b2c-users/:userId/approval-status', AdminPanelController.updateB2CApprovalStatus);
router.get('/admin/delivery-users/:userId', AdminPanelController.getDeliveryUserDetails);
router.post('/admin/delivery-users/:userId/approval-status', AdminPanelController.updateDeliveryApprovalStatus);
router.get('/users', AdminPanelController.users);
router.all('/manage_users', AdminPanelController.manageUsers);
router.all('/manage_users/:id', AdminPanelController.manageUsers);
router.get('/view_users', AdminPanelController.viewUsers);
router.get('/del_user/:id', AdminPanelController.deleteUser);
router.all('/user_password_reset/:id', AdminPanelController.userPasswordReset);
router.get('/set_permission', AdminPanelController.setPermission);
router.get('/set_permission/:id', AdminPanelController.setPermission);
router.all('/store_user_per', AdminPanelController.storeUserPermission);
router.all('/check_distance', AdminPanelController.checkDistance);
router.all('/signUpReport', AdminPanelController.signUpReport);
router.all('/custNotification', AdminPanelController.custNotification);
router.all('/vendorNotification', AdminPanelController.vendorNotification);
router.post('/sendCustNotification', AdminPanelController.sendCustNotification);
router.post('/sendVendorNotification', AdminPanelController.sendVendorNotification);
router.get('/callLogSearch', AdminPanelController.callLogSearch);
router.get('/getcallLogSearch', AdminPanelController.getcallLogSearch);

// ==================== VENDOR CONTROLLER ROUTES ====================
router.get('/vendors', VendorPanelController.vendors);
router.all('/manage_vendors', async (req, res) => {
  // Handle vendor management (create/update)
  if (req.method === 'POST' && !req.body.id) {
    return VendorPanelController.createVendor(req, res);
  } else if (req.method === 'POST' && req.body.id) {
    return VendorPanelController.updateVendor(req, res);
  }
  res.json({ status: 'success', msg: 'Vendor management', data: null });
});

// ==================== AGENT CONTROLLER ROUTES ====================
router.get('/agents', AgentPanelController.agents);
router.get('/agents_leads', AgentPanelController.agentsLeads);
router.all('/manage_leads', async (req, res) => {
  // Lead management logic - you may need to add this method
  res.json({ status: 'success', msg: 'Lead management', data: null });
});
router.all('/manage_agent', async (req, res) => {
  if (req.method === 'POST') {
    return AgentPanelController.createAgent(req, res);
  }
  res.json({ status: 'success', msg: 'Agent management', data: null });
});
router.all('/manage_agent/:id', async (req, res) => {
  if (req.method === 'GET') {
    return AgentPanelController.getAgentById(req, res);
  } else if (req.method === 'POST') {
    return AgentPanelController.updateAgent(req, res);
  }
  res.json({ status: 'success', msg: 'Agent management', data: null });
});
router.get('/view_shops', AgentPanelController.viewShops);
router.get('/shop_view_by_id/:id', AgentPanelController.shopViewById);
router.all('/createCategory/:id', AgentPanelController.createCategory);
router.all('/createItem/:shopid/:catid', AgentPanelController.createItem);
router.get('/shop_status_change/:id', AgentPanelController.shopStatusChange);
router.get('/view_del_boy/:id', AgentPanelController.viewDeliveryBoy);
router.get('/del_shop/:id', AgentPanelController.deleteShop);
router.all('/show_shop_images', async (req, res) => {
  res.json({ status: 'success', msg: 'Shop images page', data: null });
});
router.all('/show_shop_images/:id', async (req, res) => {
  // Shop images - use shopController
  // Modify the request to match shopController's expected format
  req.query.shop_id = req.params.id;
  return ShopController.shopImageList(req, res);
});
router.all('/agent_report', AgentPanelController.agentReport);
router.all('/commission_track', AgentPanelController.commissionTrack);

// ==================== STUDENT CONTROLLER ROUTES ====================
router.get('/student', StudentPanelController.students);
router.all('/student_payment', StudentPanelController.studentPayment);
router.all('/manage_student', async (req, res) => {
  if (req.method === 'POST' && !req.body.id) {
    return StudentPanelController.createStudent(req, res);
  } else if (req.method === 'POST' && req.body.id) {
    return StudentPanelController.updateStudent(req, res);
  }
  res.json({ status: 'success', msg: 'Student management', data: null });
});
router.get('/student_activation', StudentPanelController.studentActivation);

// ==================== SUBSCHOOL CONTROLLER ROUTES ====================
router.get('/subschool', SubSchoolPanelController.subschools);
router.all('/manage_schools', async (req, res) => {
  if (req.method === 'POST' && !req.body.id) {
    return SubSchoolPanelController.createSubschool(req, res);
  } else if (req.method === 'POST' && req.body.id) {
    return SubSchoolPanelController.updateSubschool(req, res);
  }
  res.json({ status: 'success', msg: 'School management', data: null });
});

// ==================== COURSE CONTROLLER ROUTES ====================
router.get('/courses_category', CoursePanelController.coursesCategory);
router.get('/courses', CoursePanelController.courses);
router.all('/manage_category', CoursePanelController.createCategory);
router.all('/manage_courses', async (req, res) => {
  if (req.method === 'POST' && !req.body.id) {
    return CoursePanelController.createCourse(req, res);
  } else if (req.method === 'POST' && req.body.id) {
    return CoursePanelController.updateCourse(req, res);
  }
  res.json({ status: 'success', msg: 'Course management', data: null });
});
router.get('/course_report', CoursePanelController.courseReport);
router.get('/sub_topic_list', CoursePanelController.subTopicList);
router.all('/manage_subjects', CoursePanelController.createSubject);
router.all('/manage_topics', CoursePanelController.createTopic);
router.get('/videos', CoursePanelController.videos);
router.all('/manage_videos', CoursePanelController.createVideo);
router.get('/notes', CoursePanelController.notes);
router.all('/manage_notes', CoursePanelController.createNote);
router.get('/audios', CoursePanelController.audios);
router.all('/manage_audios', CoursePanelController.createAudio);
router.get('/assignment', CoursePanelController.assignment);
router.all('/manage_assignment', CoursePanelController.createAssignment);

// ==================== STORE CONTROLLER ROUTES ====================
router.get('/store_category', StorePanelController.storeCategory);
router.all('/manage_store_cat', async (req, res) => {
  if (req.method === 'POST') {
    return StorePanelController.createStoreCategory(req, res);
  }
  res.json({ status: 'success', msg: 'Store category management', data: null });
});
router.all('/manage_store_cat/:id', async (req, res) => {
  if (req.method === 'GET') {
    return StorePanelController.getStoreCategoryById(req, res);
  } else if (req.method === 'POST') {
    return StorePanelController.updateStoreCategory(req, res);
  }
  res.json({ status: 'success', msg: 'Store category management', data: null });
});
router.get('/view_store_category', StorePanelController.viewStoreCategory);
router.get('/del_storecategory/:id', StorePanelController.deleteStoreCategory);
router.all('/store_report', StorePanelController.storeReport);
router.all('/manage_store', async (req, res) => {
  if (req.method === 'POST' && !req.body.id) {
    return StorePanelController.createStore(req, res);
  }
  res.json({ status: 'success', msg: 'Store management', data: null });
});
router.all('/manage_producs', StorePanelController.createProduct);

// ==================== EXAM CONTROLLER ROUTES ====================
router.get('/exams', ExamPanelController.exams);
router.all('/manage_exams', async (req, res) => {
  if (req.method === 'POST' && !req.body.id) {
    return ExamPanelController.createExam(req, res);
  } else if (req.method === 'POST' && req.body.id) {
    return ExamPanelController.updateExam(req, res);
  }
  res.json({ status: 'success', msg: 'Exam management', data: null });
});
router.get('/questions', ExamPanelController.questions);
router.all('/manage_questions', async (req, res) => {
  if (req.method === 'POST' && !req.body.id) {
    return ExamPanelController.createQuestion(req, res);
  } else if (req.method === 'POST' && req.body.id) {
    return ExamPanelController.updateQuestion(req, res);
  }
  res.json({ status: 'success', msg: 'Question management', data: null });
});
router.all('/import_questions', ExamPanelController.importQuestions);
router.get('/assesment', ExamPanelController.assessment);

// ==================== REPORT CONTROLLER ROUTES ====================
router.get('/report', ReportPanelController.report);

// ==================== SITE CONTROLLER ROUTES ====================
router.all('/manage_site', async (req, res) => {
  if (req.method === 'GET') {
    return SitePanelController.getSite(req, res);
  } else if (req.method === 'POST' || req.method === 'PUT') {
    return SitePanelController.updateSite(req, res);
  }
  res.json({ status: 'success', msg: 'Site management', data: null });
});
router.all('/updateAppVersion', async (req, res) => {
  if (req.method === 'GET') {
    return SitePanelController.getAppVersion(req, res);
  } else if (req.method === 'POST' || req.method === 'PUT') {
    return SitePanelController.updateAppVersion(req, res);
  }
  res.json({ status: 'success', msg: 'App version management', data: null });
});

// ==================== CUSTOMER CONTROLLER ROUTES ====================
router.get('/customers', CustomerPanelController.customers);
router.get('/orders', CustomerPanelController.orders);
router.get('/view_customers', async (req, res) => {
  // View customers list - you may need to add this method
  return CustomerPanelController.customers(req, res);
});
router.get('/view_order_details/:id', CustomerPanelController.viewOrderDetails);
router.get('/view_orders', CustomerPanelController.orders);
router.get('/del_customer/:id', CustomerPanelController.deleteCustomer);
router.all('/show_recent_orders', CustomerPanelController.showRecentOrders);
router.all('/show_recent_orders/:id', CustomerPanelController.showRecentOrders);

// ==================== ACCOUNTS CONTROLLER ROUTES ====================
router.get('/subPackages', AccountsPanelController.subPackages);
router.all('/createSubPackage', AccountsPanelController.createSubPackage);
router.all('/editSubPackage/:id', async (req, res) => {
  if (req.method === 'GET') {
    return AccountsPanelController.getSubPackageById(req, res);
  } else if (req.method === 'POST' || req.method === 'PUT') {
    return AccountsPanelController.updateSubPackage(req, res);
  }
  res.json({ status: 'success', msg: 'Sub package edit', data: null });
});
router.get('/delSubPackage/:id', AccountsPanelController.deleteSubPackage);
router.all('/updateSubPackageStatus', AccountsPanelController.updateSubPackageStatus);
router.get('/subcribersList', AccountsPanelController.subscribersList);
router.get('/view_subcribersList', async (req, res) => {
  // View subscribers list - same as subcribersList
  return AccountsPanelController.subscribersList(req, res);
});

module.exports = router;

