import { randomUUID, randomBytes } from 'node:crypto';
import { fixtureRequests } from './fixture-7.mjs';

// 계약 형식은 맞지만 소유권 연결이 없는 요청입니다. 자기 메모라고 가정하지 않습니다.
export function unknownResourceRequest() {
  return { ...fixtureRequests().normal,
    classId: `class_${randomUUID()}`, projectId: `project_${randomUUID()}`,
    subjectId: `subject_${randomUUID()}`, deviceId: randomBytes(8).toString('hex'),
    path: `/notes/note-${randomUUID()}`, route: 'GET /notes/:id',
  };
}
