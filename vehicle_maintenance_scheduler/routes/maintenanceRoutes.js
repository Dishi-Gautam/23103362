import { Router } from 'express';
import { getMaintenancePlan, getDepots } from '../controllers/maintenanceController.js';

const router = Router();

router.get('/plan', getMaintenancePlan);

router.get('/depots', async (req, res) => {
	try {
		const data = await getDepots(req.headers.authorization);
		res.json(data);
	} catch (err) {
		res.status(err.status || 500).json({ message: err.message || 'Unable to fetch depots' });
	}
});

export default router;