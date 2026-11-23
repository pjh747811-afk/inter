import type { Question } from './research';

export const webtoonTopic = '일상을 웹툰으로 · 고객검증';

export const webtoonInterview = [
  {
    stage: '1. 최근 기록 경험',
    prompt: '최근 일주일 동안 일상에서 기억에 남아 사진이나 글로 남긴 순간이 있었나요? 어떻게 남겼나요?',
    purpose: '실제로 일상을 기록하는 빈도와 동기 확인',
  },
  {
    stage: '2. 기존 정리·공유 방식',
    prompt: '그 기록을 SNS나 메신저로 공유할 때 보통 어떤 앱을 쓰고, 올리기까지 얼마나 걸리나요?',
    purpose: '현재 사용하는 대안 툴과 소요 시간 파악',
  },
  {
    stage: '3. 편집의 번거로움',
    prompt: '기록을 꾸미거나 스토리로 만들다가 중간에 포기하거나 업로드를 미룬 적이 있다면 언제였나요?',
    purpose: '구체적인 이탈 지점과 페인포인트 탐색',
  },
  {
    stage: '4. 대안 비용과 투자',
    prompt: '그림, 일기, 꾸미기 앱이나 템플릿 등에 실제로 유료 결제해 본 경험이 있나요?',
    purpose: '기록·콘텐츠 꾸미기 영역의 지불 이력 검증',
  },
  {
    stage: '5. 시제품/컨셉 반응',
    prompt: '사진과 한 줄 메모를 넣으면 4컷 웹툰으로 만들어 주는 서비스가 있다면, 방금 말씀하신 최근 순간 중 어떤 장면을 넣어 보고 싶나요?',
    purpose: '추상적 칭찬이 아닌 구체적 적용 장면 확인',
  },
  {
    stage: '6. 우려와 장벽',
    prompt: '내 일상 사진이나 이야기가 만화로 바뀔 때 가장 걱정되거나 어색할 것 같은 부분은 무엇인가요?',
    purpose: '화풍, 프라이버시, 퀄리티 등 도입 장벽 발굴',
  },
  {
    stage: '7. 후속 행동 의향',
    prompt: '다음 주에 프로토타입으로 첫 4컷 웹툰을 만들어 드리면 직접 체험 후 피드백 주실 수 있나요?',
    purpose: '말뿐인 호감이 아닌 실제 참여 약속(Commitment) 확인',
  },
];

export const webtoonSurvey: Question[] = [
  {
    label: '평소 일상 기록(사진, 일기, 릴스, 블로그 등)을 얼마나 자주 남기시나요?',
    type: 'choice',
    required: true,
    options: ['거의 매일', '주 2~3회', '주 1회 이하', '거의 남기지 않음'],
  },
  {
    label: '일상을 기록하거나 공유할 때 주로 어떤 도구를 사용하시나요?',
    type: 'choice',
    required: true,
    options: ['인스타그램 스토리/피드', '네이버 블로그·브런치', '노션·일기장 앱', '카카오톡 나에게 쓰기/갤러리 보관'],
  },
  {
    label: '기록을 콘텐츠로 편집하고 정리하는 과정이 번거로워 공유를 미룬 적이 있다.',
    type: 'scale',
    required: true,
    options: [],
  },
  {
    label: '일상 사진과 짧은 메모만으로 4컷 웹툰이 자동 생성된다면 가장 기대되는 점은 무엇인가요?',
    type: 'choice',
    required: true,
    options: ['꾸미기·편집 시간 단축', '재미있고 독창적인 SNS 공유', '내 얼굴 노출 없이 일상 기록', '기념일·여행 등 특별한 아카이빙'],
  },
  {
    label: '반대로 웹툰 변환 기능을 쓰기 망설여지는 이유가 있다면 무엇인가요?',
    type: 'text',
    required: false,
    options: [],
  },
  {
    label: '내 일상을 반영한 맞춤형 4컷 웹툰 제작 서비스에 대해 월 유료 구독 또는 건당 결제 의향이 있다.',
    type: 'scale',
    required: true,
    options: [],
  },
];
