import { Router } from 'express';
import { SearchController } from '@/controllers/SearchController';
import { authenticate, validate } from '@/middleware';

const router = Router();

router.use(authenticate);
router.get('/', validate(SearchController.validation), SearchController.search);

export default router;
