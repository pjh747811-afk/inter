import type { Question } from './research';

export type TemplateCategory = '전체' | '초기 검증' | '컨셉·제품' | '수익화·이탈' | '스크리닝';

export interface InterviewTemplateItem {
  stage: string;
  prompt: string;
  purpose: string;
}

export interface ResearchTemplate {
  id: string;
  title: string;
  category: Exclude<TemplateCategory, '전체'>;
  situation: string;
  whenToUse: string;
  cautionTip: string;
  surveyTitle: string;
  surveyIntro: string;
  interview: InterviewTemplateItem[];
  survey: Question[];
}

export const templateCategories: TemplateCategory[] = [
  '전체',
  '초기 검증',
  '컨셉·제품',
  '수익화·이탈',
  '스크리닝',
];

export const researchTemplates: ResearchTemplate[] = [
  {
    id: 'problem-discovery',
    title: '고객 문제 검증',
    category: '초기 검증',
    situation: '고객이 겪는 문제의 실제 빈도, 해결 비용, 현재 대안의 한계를 파고들 때',
    whenToUse: '아이디어나 솔루션을 소개하기 전, 문제가 실제로 돈을 내거나 시간을 쓸 만큼 아픈지 확인할 때 사용하세요.',
    cautionTip: '"이런 기능이 있으면 쓰실 건가요?" 같은 미래 가정 대신 지난 1~4주 내 실제 행동과 지출 내역을 물어보세요.',
    surveyTitle: '업무·일상 문제 경험 및 해결 방식 실태 조사',
    surveyIntro:
      '안녕하세요. 평소 겪으시는 불편함과 현재 해결 방식을 이해하기 위한 짧은 설문(약 2분 소요)입니다. 응답 내용은 연구 및 서비스 기획 목적으로만 활용되며 익명으로 처리됩니다.',
    interview: [
      {
        stage: '1. 최근 발생 맥락',
        prompt: '최근 2주 안에 이 문제 때문에 시간을 빼앗기거나 스트레스를 받았던 가장 구체적인 순간을 떠올려 주실 수 있나요?',
        purpose: '상상이나 일반론이 아닌 실제 최근 사건(Fact) 확보',
      },
      {
        stage: '2. 현재 해결 방식',
        prompt: '그때 문제를 해결하기 위해 실제로 어떤 도구나 방법을 쓰셨나요? 순서대로 알려 주세요.',
        purpose: '고객이 이미 채택하고 있는 현실 대안(Alternative) 파악',
      },
      {
        stage: '3. 소요 비용 측정',
        prompt: '그 방식으로 처리하는 데 시간이나 인력, 금전 비용이 대략 얼마나 들었나요?',
        purpose: '문제의 심각도를 시간·금액 단위로 정량화',
      },
      {
        stage: '4. 대안의 병목 지점',
        prompt: '현재 사용 중인 방법에서 가장 번거롭거나 실수가 자주 나는 단계는 어디였나요?',
        purpose: '기존 대안에서 대체 가능한 명확한 틈새 발굴',
      },
      {
        stage: '5. 탐색·지불 이력',
        prompt: '이 불편을 줄이려고 다른 서비스를 찾아보거나 유료 툴·외주에 비용을 써 본 적이 있나요?',
        purpose: '말뿐인 불편인지, 실제 해결 의지가 있는 문제인지 판별',
      },
      {
        stage: '6. 방치 시 영향',
        prompt: '만약 이 문제를 따로 해결하지 않고 그대로 둔다면 어떤 손실이나 불이익이 생기나요?',
        purpose: '필수 해결 과제(Must-have) 여부 검증',
      },
    ],
    survey: [
      {
        label: '최근 한 달 동안 관련 문제나 불편을 얼마나 자주 경험하셨나요?',
        type: 'choice',
        required: true,
        options: ['거의 매일', '주 2~3회', '월 1~3회', '경험한 적 없음'],
      },
      {
        label: '현재 이 문제를 해결하기 위해 주로 어떤 방식을 사용하고 계신가요?',
        type: 'choice',
        required: true,
        options: ['엑셀·스프레드시트 수기 정리', '메모·노션 등 범용 앱 활용', '전용 유료 서비스 이용', '해결하지 않고 감수함'],
      },
      {
        label: '현재 사용 중인 해결 방식은 과정이 번거롭거나 시간이 많이 든다.',
        type: 'scale',
        required: true,
        options: [],
      },
      {
        label: '가장 최근에 이 문제를 겪었을 때 어떤 점이 가장 불편했는지 구체적으로 적어 주세요.',
        type: 'text',
        required: true,
        options: [],
      },
      {
        label: '이 문제를 해결하기 위해 유료 서비스나 외주에 비용을 지불해 본 적이 있나요?',
        type: 'choice',
        required: true,
        options: ['현재 유료로 이용 중', '과거에 결제해 본 적 있음', '무료 방법만 써 봄', '비용을 쓸 생각 없음'],
      },
    ],
  },
  {
    id: 'value-proposition',
    title: '가치 제안 테스트',
    category: '컨셉·제품',
    situation: '핵심 컨셉, 한 줄 메시지, 기대 혜택이 타겟 고객에게 명확히 와닿는지 검증할 때',
    whenToUse: '랜딩 페이지 문구, 서비스 소개 카드, 핵심 기능 우선순위를 정하기 전에 활용하세요.',
    cautionTip: '"좋아 보이네요"라는 예의상 칭찬은 신호가 아닙니다. 기존 방식에서 굳이 갈아탈 이유가 있는지를 확인하세요.',
    surveyTitle: '신규 서비스 컨셉 및 핵심 가치 적합성 설문',
    surveyIntro:
      '안녕하세요. 새롭게 준비 중인 서비스 방향에 대해 실제 잠재 사용자분들의 솔직한 의견을 여쭙고자 합니다. 약 2~3분 소요되며, 부정적인 의견도 큰 도움이 됩니다.',
    interview: [
      {
        stage: '1. 첫인상 및 이해도',
        prompt: '방금 보신 서비스 설명을 읽고 나서, 이 서비스가 정확히 무엇을 해 주는 도구라고 이해하셨나요?',
        purpose: '가치 제안 문구가 고객 언어로 오해 없이 전달되는지 확인',
      },
      {
        stage: '2. 가장 끌리는 가치',
        prompt: '제시된 특징 중 본인의 현재 상황에서 가장 먼저 써 보고 싶게 만드는 요소는 무엇인가요? 왜 그런가요?',
        purpose: '핵심 셀링 포인트(Hook)와 실제 니즈 연결 확인',
      },
      {
        stage: '3. 전환 임계점 비교',
        prompt: '지금 쓰고 계신 방식 대신 이 서비스로 옮겨 탄다면, 어떤 점이 확실히 달라져야 번거로움을 감수하고 바꿀 것 같나요?',
        purpose: '기존 습관을 깨고 전환하게 만드는 최소 가치 기준(Switching Trigger) 파악',
      },
      {
        stage: '4. 신뢰·도입 장벽',
        prompt: '이 설명만 보셨을 때 과장되어 보이거나, 실제로 내 업무·일상에 쓰기엔 걱정되는 점이 있다면 무엇인가요?',
        purpose: '도입을 막는 심리적·실무적 리스크 조기 발견',
      },
      {
        stage: '5. 구체적 적용 장면',
        prompt: '만약 오늘 바로 계정을 드린다면, 이번 주 일정 중 정확히 어떤 작업에 먼저 적용해 보시겠어요?',
        purpose: '추상적 호감이 아닌 실제 사용 시나리오 검증',
      },
      {
        stage: '6. 참여 커밋먼트',
        prompt: '다음 주에 초기 버전이 열리면 이메일로 초대장을 보내드리고 10분 피드백을 여쭤봐도 괜찮을까요?',
        purpose: '실제 대기/참여 행동을 통한 진성 수요 판별',
      },
    ],
    survey: [
      {
        label: '제안된 서비스의 핵심 가치가 현재 겪고 있는 문제 해결에 도움이 될 것 같다.',
        type: 'scale',
        required: true,
        options: [],
      },
      {
        label: '서비스 설명 중 가장 기대되거나 필요하다고 느낀 혜택은 무엇인가요?',
        type: 'choice',
        required: true,
        options: ['반복 작업 시간 단축', '정확도·품질 향상', '비용 절감', '한눈에 보는 관리·분석'],
      },
      {
        label: '기존에 쓰던 방식 대신 이 서비스로 전환할 의향이 있다.',
        type: 'scale',
        required: true,
        options: [],
      },
      {
        label: '서비스 설명을 보고 망설여지거나 의문이 드는 부분이 있다면 자유롭게 적어 주세요.',
        type: 'text',
        required: false,
        options: [],
      },
      {
        label: '초기 베타 버전이 공개되면 직접 체험해 보실 의향이 있나요?',
        type: 'choice',
        required: true,
        options: ['바로 체험해 보고 싶음', '기능 완성 후 이용해 보고 싶음', '아직 잘 모르겠음', '이용 의향 없음'],
      },
    ],
  },
  {
    id: 'usability-mvp',
    title: '사용성 · MVP 피드백',
    category: '컨셉·제품',
    situation: '초기 프로토타입이나 MVP를 직접 조작하게 한 뒤 UX 병목과 개선 우선순위를 찾을 때',
    whenToUse: '와이어프레임, 클릭 가능한 프로토타입, 혹은 베타 서비스 첫 사용 직후에 사용하세요.',
    cautionTip: '사용자가 막혔을 때 바로 버튼을 알려주지 말고 "지금 화면에서 어떤 행동을 기대하셨나요?"라고 먼저 물어보세요.',
    surveyTitle: '프로토타입 이용 경험 및 사용성 평가 설문',
    surveyIntro:
      '안녕하세요. 방금 체험하신 프로토타입의 불편한 점과 개선할 부분을 찾기 위한 설문입니다. 테스트 중 헷갈리거나 막혔던 경험을 가감 없이 남겨 주세요.',
    interview: [
      {
        stage: '1. 첫 화면 기대치',
        prompt: '첫 화면을 보셨을 때 가장 먼저 무엇을 눌러야 할지 자연스럽게 보이셨나요? 어디로 시선이 갔나요?',
        purpose: '초기 온보딩 및 정보 구조(IA) 직관성 점검',
      },
      {
        stage: '2. 과업 수행 막힘 구간',
        prompt: '핵심 기능을 완료하는 과정에서 잠깐이라도 멈칫하거나 "이게 맞나?" 하고 망설였던 순간이 있었나요?',
        purpose: '이탈을 유발하는 UX 마찰 지점(Friction) 포착',
      },
      {
        stage: '3. 용어·라벨 이해도',
        prompt: '화면의 메뉴명이나 안내 문구 중 뜻이 모호하거나 다른 의미로 오해했던 표현이 있었나요?',
        purpose: 'UX 라이팅과 도메인 용어 적합성 점검',
      },
      {
        stage: '4. 결과물 만족도',
        prompt: '작업을 마치고 나온 결과 화면이 처음 기대했던 수준과 비교해 어느 정도 충족되었나요?',
        purpose: '핵심 가치 전달 결과물(Output) 품질 확인',
      },
      {
        stage: '5. 필수 보완 기능',
        prompt: '실제 업무나 일상에서 매주 쓰려면 지금 화면에서 딱 한 가지만 고치거나 추가해야 한다면 무엇일까요?',
        purpose: '다음 스프린트 최우선 개발 과제 도출',
      },
    ],
    survey: [
      {
        label: '별도의 설명 없이도 핵심 기능을 처음부터 끝까지 쉽게 사용할 수 있었다.',
        type: 'scale',
        required: true,
        options: [],
      },
      {
        label: '화면의 메뉴 구성과 용어 안내가 직관적으로 이해되었다.',
        type: 'scale',
        required: true,
        options: [],
      },
      {
        label: '이용 중 가장 헷갈렸거나 시간이 오래 걸린 단계는 어디였나요?',
        type: 'choice',
        required: true,
        options: ['시작·온보딩 단계', '정보 입력·설정 단계', '결과 확인·해석 단계', '막힌 부분 없이 매끄러웠음'],
      },
      {
        label: '이용하면서 가장 아쉬웠거나 수정되었으면 하는 부분을 구체적으로 적어 주세요.',
        type: 'text',
        required: true,
        options: [],
      },
      {
        label: '현재 수준에서 이 기능을 다음에도 다시 사용할 의향이 있다.',
        type: 'scale',
        required: true,
        options: [],
      },
    ],
  },
  {
    id: 'pricing-willingness',
    title: '가격 수용도 · 지불 의향',
    category: '수익화·이탈',
    situation: '유료 요금제 가격대, 과금 모델(구독/건당), 결제 전환 조건을 검증할 때',
    whenToUse: '유료 플랜 출시 전 적정 가격 범위(Van Westendorp 기준)와 결제 트리거를 파악할 때 활용하세요.',
    cautionTip: '"얼마면 내시겠어요?"보다 "현재 유사한 생산성 툴에 월 얼마까지 지출 중이신가요?"가 훨씬 정확합니다.',
    surveyTitle: '서비스 요금제 구조 및 적정 가격대 조사',
    surveyIntro:
      '안녕하세요. 합리적인 요금제와 혜택 구성을 설계하기 위한 짧은 설문(약 2분 소요)입니다. 솔직한 기준을 알려주시면 요금 설계에 직접 반영하겠습니다.',
    interview: [
      {
        stage: '1. 현재 툴 지출 기준',
        prompt: '현재 업무나 취미를 위해 유료로 구독하거나 결제해서 쓰고 있는 앱·서비스와 월 지출 규모를 알려주실 수 있나요?',
        purpose: '고객의 실제 지불 예산 한도(Budget Anchor) 확인',
      },
      {
        stage: '2. 과금 단위 선호',
        prompt: '월 정액 구독 방식과 실제 쓴 만큼만 내는 건당·크레딧 방식 중 본인의 사용 패턴에는 어떤 쪽이 더 부담이 적나요?',
        purpose: '사용 빈도에 맞는 수익 모델 구조 결정',
      },
      {
        stage: '3. 가격 민감도 구간',
        prompt: '이 기능이 제공된다고 가정할 때, "너무 싸서 품질이 의심되는 가격", "기꺼이 낼 만한 가격", "비싸서 포기할 가격"은 각각 어느 선인가요?',
        purpose: '가격 수용 범위 상·하한선 도출',
      },
      {
        stage: '4. 유료 전환 결정 요인',
        prompt: '무료 플랜을 쓰다가 유료 결제로 넘어가게 된다면, 어떤 제한이 풀리거나 어떤 기능이 열릴 때 지갑을 열 것 같나요?',
        purpose: 'Paywall 및 유료 플랜 핵심 차별화 포인트 파악',
      },
      {
        stage: '5. 결제 프로세스 장벽',
        prompt: '실제 결제할 때 개인 카드 결제인지, 회사 비용 처리(세금계산서 등)가 필요한지 등 절차상 걸림돌은 없나요?',
        purpose: 'B2C vs B2B 결제 및 승인 구조 파악',
      },
    ],
    survey: [
      {
        label: '현재 업무 또는 생산성 향상을 위해 유료 서비스에 월평균 얼마 정도 지출하시나요?',
        type: 'choice',
        required: true,
        options: ['유료 결제 없음', '월 1만 원 미만', '월 1만~3만 원', '월 3만 원 이상'],
      },
      {
        label: '가장 부담 없이 받아들일 수 있는 요금 방식은 무엇인가요?',
        type: 'choice',
        required: true,
        options: ['월 정액 무제한 구독', '연간 할인 구독', '사용한 만큼 건당·크레딧 결제', '기본 무료 + 고급 기능 유료'],
      },
      {
        label: '핵심 기능을 월 9,900원~19,000원 수준으로 제공한다면 지불할 만한 가치가 있다고 느낀다.',
        type: 'scale',
        required: true,
        options: [],
      },
      {
        label: '유료 결제까지 망설이게 만드는 가장 큰 이유나, 유료 전환에 꼭 필요한 조건은 무엇인가요?',
        type: 'text',
        required: true,
        options: [],
      },
      {
        label: '결제 전 최소 며칠 정도의 무료 체험 기간이 있으면 충분히 가치를 판단할 수 있을까요?',
        type: 'choice',
        required: true,
        options: ['무료 체험 없이 바로 판단 가능', '3~7일 체험', '14일 체험', '1개월 이상 체험 필요'],
      },
    ],
  },
  {
    id: 'churn-winback',
    title: '이탈 · 미사용 원인 분석',
    category: '수익화·이탈',
    situation: '가입 후 사용을 멈췄거나 유료 구독을 해지한 고객의 진짜 이유를 확인할 때',
    whenToUse: '리텐션이 떨어지는 구간이나 해지 설문, 휴면 고객 인터뷰 시 사용하세요.',
    cautionTip: '방어적으로 변명하지 말고 "어떤 기대를 갖고 오셨다가 어느 시점에 식으셨는지" 시간 순서대로 들어보세요.',
    surveyTitle: '서비스 이용 중단 원인 및 개선 의견 조사',
    surveyIntro:
      '안녕하세요. 최근 서비스 이용이 뜸해지시거나 중단하신 이유를 여쭙고 더 나은 방향으로 고치기 위한 짧은 설문입니다. 솔직한 피드백에 감사드립니다.',
    interview: [
      {
        stage: '1. 최초 도입 동기',
        prompt: '처음 이 서비스를 찾아서 가입(또는 결제)하셨을 때, 당장 해결하고 싶었던 가장 급한 문제는 무엇이었나요?',
        purpose: '유입 당시 고객이 기대했던 핵심 문제 확인',
      },
      {
        stage: '2. 기대와 현실의 간극',
        prompt: '막상 써 보셨을 때 처음 기대했던 것과 가장 달랐던 부분은 무엇이었나요?',
        purpose: '온보딩·마케팅 약속과 실제 제품 경험 간 갭 발견',
      },
      {
        stage: '3. 사용 빈도 하락 시점',
        prompt: '처음 몇 번 쓰신 뒤로 점점 손이 잘 안 가게 된 결정적인 계기나 불편한 상황이 있었나요?',
        purpose: '습관 형성 실패 및 이탈 트리거 규명',
      },
      {
        stage: '4. 이탈 후 이동 대안',
        prompt: '사용을 멈추신 뒤로는 그 문제를 다시 어떤 방법(또는 다른 서비스)으로 해결하고 계신가요?',
        purpose: '실제 경쟁 대안으로의 회귀 패턴 분석',
      },
      {
        stage: '5. 복귀 조건',
        prompt: '앞으로 어떤 부분이 달라진다면 다시 한 번 열어 보고 싶으실 것 같나요?',
        purpose: '재활성화(Win-back) 우선순위 과제 도출',
      },
    ],
    survey: [
      {
        label: '서비스 이용을 중단하거나 사용 빈도가 줄어든 가장 큰 이유는 무엇인가요?',
        type: 'choice',
        required: true,
        options: ['기대한 핵심 기능이 부족함', '사용법이 복잡하고 번거로움', '가격 대비 효용이 낮게 느껴짐', '문제가 해결되었거나 필요성이 줄어듦'],
      },
      {
        label: '처음 기대했던 목적을 달성하는 데 서비스가 충분히 도움이 되었다.',
        type: 'scale',
        required: true,
        options: [],
      },
      {
        label: '이용을 멈춘 후 현재는 어떤 대체 수단을 사용하고 계신가요?',
        type: 'choice',
        required: true,
        options: ['기존에 쓰던 방식(엑셀·메모 등)으로 복귀', '다른 경쟁 서비스 이용 중', '따로 해결하지 않음', '기타'],
      },
      {
        label: '사용하면서 가장 실망했거나 불편했던 구체적인 장면을 한 가지만 들려주세요.',
        type: 'text',
        required: true,
        options: [],
      },
      {
        label: '아쉬웠던 점이 개선된다면 다시 이용해 볼 의향이 있다.',
        type: 'scale',
        required: true,
        options: [],
      },
    ],
  },
  {
    id: 'target-screening',
    title: '타겟 스크리닝 · 세그먼트 파악',
    category: '스크리닝',
    situation: '인터뷰 대상자 모집 전, 핵심 타겟 조건과 행동 특성을 빠르게 선별할 때',
    whenToUse: '커뮤니티나 오픈채팅에 모집 설문을 배포해 적합한 인터뷰이를 고를 때 사용하세요.',
    cautionTip: '"우리 제품 타겟인가요?"를 직접 묻지 말고, 최근 1개월 행동 빈도와 역할을 객관식 문항으로 걸러내세요.',
    surveyTitle: '사용자 경험 리서치 참여자 사전 스크리닝 설문',
    surveyIntro:
      '안녕하세요. 실사용자분들의 생생한 경험을 듣기 위한 짧은 사전 설문(약 1분 소요)입니다. 조건에 맞으시는 분들께는 별도로 20분 온라인 인터뷰 참여 안내를 드릴 예정입니다.',
    interview: [
      {
        stage: '1. 역할 및 작업 환경',
        prompt: '현재 주로 담당하시는 역할과 하루 중 관련 작업에 쓰는 시간 비중이 어느 정도인가요?',
        purpose: '핵심 페르소나 적합성 확인',
      },
      {
        stage: '2. 최근 과업 빈도',
        prompt: '지난 4주 동안 이 작업을 실제로 몇 번 정도 직접 진행하셨나요?',
        purpose: '고빈도 핵심 타겟과 간헐적 사용자 구분',
      },
      {
        stage: '3. 현재 도구 스택',
        prompt: '지금 이 흐름을 처리할 때 연결해서 함께 쓰는 앱이나 파일 형식은 주로 무엇인가요?',
        purpose: '연동·호환이 필요한 주변 생태계 파악',
      },
      {
        stage: '4. 심층 인터뷰 적합성',
        prompt: '최근 작업 중 가장 기억에 남는 에피소드 하나만 짧게 말씀해 주실 수 있나요?',
        purpose: '구체적인 경험을 생생하게 풀어낼 수 있는 응답자 선별',
      },
    ],
    survey: [
      {
        label: '현재 본인의 주된 역할 또는 활동 형태에 가장 가까운 것은 무엇인가요?',
        type: 'choice',
        required: true,
        options: ['직장인(실무 담당자)', '프리랜서·1인 사업자', '스타트업·팀 리더', '학생·취업준비생'],
      },
      {
        label: '최근 한 달간 관련 작업이나 문제를 직접 경험하신 횟수는 어느 정도인가요?',
        type: 'choice',
        required: true,
        options: ['주 3회 이상', '주 1~2회', '월 1~3회', '최근 한 달 내 경험 없음'],
      },
      {
        label: '현재 주로 사용 중인 도구 또는 해결 방식을 간단히 적어 주세요.',
        type: 'text',
        required: true,
        options: [],
      },
      {
        label: '20분 내외의 비대면(화상/음성) 심층 인터뷰 참여가 가능하신가요?',
        type: 'choice',
        required: true,
        options: ['평일 낮 시간 가능', '평일 저녁·주말 가능', '서면·설문 참여만 가능', '참여 어려움'],
      },
      {
        label: '인터뷰 선정 시 연락받으실 이메일 또는 메신저 연락처(선택)를 남겨 주세요.',
        type: 'text',
        required: false,
        options: [],
      },
    ],
  },
];

export function getResearchTemplateById(id: string): ResearchTemplate | undefined {
  return researchTemplates.find((t) => t.id === id);
}
