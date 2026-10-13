import { randomUUID, randomBytes } from 'node:crypto';
import { fixtureRequests } from './fixture-7.mjs';

// 시험용 정책의 리터럴 ID가 아닌 계약 형식의 가명 주체/기기로 정상 읽기를 연습합니다.
export function unmappedOwnRequest() {
  return { ...fixtureRequests().normal,
    classId: `class_${randomUUID()}`, projectId: `project_${randomUUID()}`,
    subjectId: `subject_${randomUUID()}`, deviceId: randomBytes(8).toString('hex'),
    path: `/notes/note-${randomUUID()}`, route: 'GET /notes/:id',
  };
}
