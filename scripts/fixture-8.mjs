import { randomUUID, randomBytes } from 'node:crypto';
import { fixtureRequests } from './fixture-7.mjs';

// 임의 ID의 계약 형식 요청입니다. 소유권은 가정하지 않고 최종 API에서 검사합니다.
export function unknownResourceRequest() {
  return { ...fixtureRequests().normal,
    classId: `class_${randomUUID()}`, projectId: `project_${randomUUID()}`,
    subjectId: `subject_${randomUUID()}`, deviceId: randomBytes(8).toString('hex'),
    path: `/notes/note-${randomUUID()}`, route: 'GET /notes/:id',
  };
}
