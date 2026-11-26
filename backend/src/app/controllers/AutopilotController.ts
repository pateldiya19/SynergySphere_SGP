import { body, param } from 'express-validator';
import { Response } from 'express';
import { AutopilotRecord, Project } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { logger, ResponseUtils } from '@/utils';
import { AutopilotService } from '@/services/AutopilotService';

export class AutopilotController {
  static projectValidation = [param('id').isMongoId().withMessage('Invalid project ID')];
  static actionValidation = [param('actionId').isMongoId().withMessage('Invalid action ID')];
  static questionValidation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    body('question').trim().isLength({ min: 1, max: 1000 }).withMessage('Question is required'),
  ];

  private static async access(req: AuthenticatedRequest) {
    return Project.findOne({
      _id: req.params.id,
      isActive: true,
      $or: [{ ownerId: req.user._id }, { 'members.userId': req.user._id }],
    });
  }

  private static async manageAccess(req: AuthenticatedRequest, projectId: string) {
    const project: any = await Project.findOne({
      _id: projectId,
      isActive: true,
      $or: [{ ownerId: req.user._id }, { 'members.userId': req.user._id }],
    });
    if (!project) return null;
    const member = project.members.find(
      (item: any) => String(item.userId) === String(req.user._id)
    );
    return String(project.ownerId) === String(req.user._id) ||
      ['owner', 'manager'].includes(member?.role)
      ? project
      : null;
  }

  /**
   * Load the board: deterministic risks and recommendations only.
   *
   * No AI call. Opening a project used to spend provider quota on every page
   * load and every refresh, which is both expensive and surprising -- nobody
   * asked for an analysis by navigating. The response still reports whether a
   * provider is configured so the UI can offer to run one, and the rule-based
   * risk detection works identically with no API key at all.
   */
  static async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!(await AutopilotController.access(req))) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }
      const analysis = await AutopilotService.analyzeProject(req.params.id);
      const records = await AutopilotService.listRecords(req.params.id);
      ResponseUtils.success(
        res,
        { ...analysis, records },
        'Autopilot analysis retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  /**
   * Run an AI analysis. This is the only path that calls the provider, and it
   * only runs because the user pressed the button.
   */
  static async analyze(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!(await AutopilotController.access(req))) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const analysis = await AutopilotService.analyzeProject(req.params.id, {
        useAi: true,
        actorId: String(req.user._id),
      });
      const records = await AutopilotService.listRecords(req.params.id);

      // A provider that is configured but failed must not look like a success:
      // report it as an error so the UI can say so rather than showing an empty
      // summary as though the analysis had run.
      if (!analysis.ai.available) {
        ResponseUtils.error(
          res,
          analysis.ai.error ||
            (analysis.ai.configured
              ? 'The configured AI provider could not complete this analysis.'
              : 'No AI provider is configured on this server.'),
          analysis.ai.configured ? 502 : 503,
          { ...analysis, records }
        );
        return;
      }

      ResponseUtils.success(res, { ...analysis, records }, 'Autopilot analysis completed');
    } catch (error: any) {
      logger.error(`Autopilot analysis failed for project ${req.params.id}: ${error.message}`);
      ResponseUtils.serverError(res, 'Autopilot analysis failed. Please retry.');
    }
  }

  static async ask(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!(await AutopilotController.access(req))) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }
      ResponseUtils.success(
        res,
        await AutopilotService.answer(req.params.id, req.body.question, String(req.user._id)),
        'Autopilot answer generated successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async stream(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!(await AutopilotController.access(req))) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      const write = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      write('start', { projectId: req.params.id });
      const result = await AutopilotService.streamAnswer(
        req.params.id,
        req.body.question,
        String(req.user._id),
        token => write('token', { token })
      );
      write('complete', {
        evidence: result.evidence,
        ai: result.status,
      });
      res.end();
    } catch (error: any) {
      logger.error(`Autopilot stream failed for project ${req.params.id}: ${error.message}`);
      if (!res.headersSent) {
        ResponseUtils.serverError(res, error.message);
        return;
      }
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error:
            error.message === 'The configured AI provider could not complete this request.'
              ? error.message
              : 'Autopilot response failed. Please retry.',
        })}\n\n`
      );
      res.end();
    }
  }

  static async approve(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const record = await AutopilotService.execute(req.params.actionId, String(req.user._id));
      ResponseUtils.success(res, record, 'Autopilot action executed successfully');
    } catch (error: any) {
      if (error.message.includes('Only project')) {
        ResponseUtils.forbidden(res, error.message);
        return;
      }
      ResponseUtils.error(res, error.message, 400);
    }
  }

  static async reject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const record = await AutopilotRecord.findOne({
        _id: req.params.actionId,
        type: 'recommendation',
      }).lean();
      if (!record) {
        ResponseUtils.notFound(res, 'Recommendation not found');
        return;
      }
      if (!(await AutopilotController.manageAccess(req, String(record.projectId)))) {
        ResponseUtils.forbidden(
          res,
          'Only project owners and managers can reject Autopilot actions'
        );
        return;
      }
      const updated = await AutopilotRecord.findOneAndUpdate(
        { _id: req.params.actionId, type: 'recommendation', status: 'pending' },
        { status: 'rejected', actorId: req.user._id },
        { new: true }
      );
      if (!updated) {
        ResponseUtils.error(res, 'Recommendation is no longer pending', 400);
        return;
      }
      ResponseUtils.success(res, updated, 'Autopilot action rejected');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
