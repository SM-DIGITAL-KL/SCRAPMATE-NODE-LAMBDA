
class ReportPanelController {
  static async report(req, res) {
    res.json({ status: 'success', msg: 'Report page', data: { pagename: 'Report' } });
  }
}

module.exports = ReportPanelController;

