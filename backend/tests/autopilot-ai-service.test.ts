jest.mock('@/services/autopilot/AutopilotGraph', () => ({
  createAutopilotGraph: jest.fn(() => ({
    invoke: jest.fn().mockRejectedValue(new Error('provider timeout')),
  })),
}));

import { AutopilotAiService } from '@/services/AutopilotAiService';
import { AutopilotService } from '@/services/AutopilotService';

describe('Autopilot AI failure handling', () => {
  it('returns an explicit unavailable result instead of fabricating an answer', async () => {
    const result = await AutopilotAiService.run({
      projectId: 'project-1',
      loadContext: jest.fn(),
      deterministicRecommendations: [],
    });

    expect(result.available).toBe(false);
    expect(result.result.summary).toBe('');
    expect(result.error).toContain('provider');
  });

  it('only treats owners and managers as approval actors', () => {
    const project = {
      ownerId: 'owner-1',
      members: [
        { userId: 'owner-1', role: 'owner' },
        { userId: 'manager-1', role: 'manager' },
        { userId: 'member-1', role: 'member' },
      ],
    };

    expect(AutopilotService.canApprove(project, 'owner-1')).toBe(true);
    expect(AutopilotService.canApprove(project, 'manager-1')).toBe(true);
    expect(AutopilotService.canApprove(project, 'member-1')).toBe(false);
  });
});
