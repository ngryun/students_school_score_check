const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const scriptSource = `${fs.readFileSync('script.js', 'utf8')}\nglobalThis.ScoreAnalyzer = ScoreAnalyzer;`;
const context = {
    document: { addEventListener() {} },
    window: {},
    console
};
vm.createContext(context);
vm.runInContext(scriptSource, context);

const configuredAnalyzer = Object.create(context.ScoreAnalyzer.prototype);
configuredAnalyzer.subjectGroups = JSON.parse(fs.readFileSync('subjectGroups.json', 'utf8'));

const fallbackAnalyzer = Object.create(context.ScoreAnalyzer.prototype);
fallbackAnalyzer.setDefaultSubjectGroups();

const officialSubjects = {
    '국어': [
        '공통국어1', '공통국어2', '화법과 언어', '독서와 작문', '문학',
        '주제 탐구 독서', '문학과 영상', '직무 의사소통',
        '독서 토론과 글쓰기', '매체 의사소통', '언어생활 탐구'
    ],
    '수학': [
        '공통수학1', '공통수학2', '기본수학1', '기본수학2', '대수', '미적분Ⅰ',
        '확률과 통계', '기하', '미적분Ⅱ', '경제 수학', '인공지능 수학',
        '직무 수학', '수학과 문화', '실용 통계', '수학과제 탐구'
    ],
    '영어': [
        '공통영어1', '공통영어2', '기본영어1', '기본영어2', '영어Ⅰ', '영어Ⅱ',
        '영어 독해와 작문', '영미 문학 읽기', '영어 발표와 토론', '심화 영어',
        '심화 영어 독해와 작문', '직무 영어', '실생활 영어 회화', '미디어 영어',
        '세계 문화와 영어'
    ],
    '사회': [
        '한국사1', '한국사2', '통합사회1', '통합사회2', '세계시민과 지리', '세계사',
        '사회와 문화', '현대사회와 윤리', '한국지리 탐구', '도시의 미래 탐구',
        '동아시아 역사 기행', '정치', '법과 사회', '경제', '윤리와 사상',
        '인문학과 윤리', '국제 관계의 이해', '여행지리', '역사로 탐구하는 현대 세계',
        '사회문제 탐구', '금융과 경제생활', '윤리문제 탐구', '기후변화와 지속가능한 세계'
    ],
    '과학': [
        '통합과학1', '통합과학2', '과학탐구실험1', '과학탐구실험2', '물리학', '화학',
        '생명과학', '지구과학', '역학과 에너지', '전자기와 양자', '물질과 에너지',
        '화학 반응의 세계', '세포와 물질대사', '생물의 유전', '지구시스템과학',
        '행성우주과학', '과학의 역사와 문화', '기후변화와 환경생태', '융합과학 탐구'
    ],
    '체육': [
        '체육1', '체육2', '운동과 건강', '스포츠 문화', '스포츠 과학',
        '스포츠 생활1', '스포츠 생활2'
    ],
    '예술': [
        '음악', '미술', '연극', '음악 연주와 창작', '음악 감상과 비평', '미술 창작',
        '미술 감상과 비평', '음악과 미디어', '미술과 매체'
    ],
    '기술·가정/정보': [
        '기술·가정', '로봇과 공학세계', '생활과학 탐구', '창의 공학 설계',
        '지식 재산 일반', '생애 설계와 자립', '아동발달과 부모', '정보',
        '인공지능 기초', '데이터 과학', '소프트웨어와 생활'
    ],
    '제2외국어/한문': [
        '독일어', '프랑스어', '스페인어', '중국어', '일본어', '러시아어', '아랍어', '베트남어',
        '독일어 회화', '프랑스어 회화', '스페인어 회화', '중국어 회화', '일본어 회화',
        '러시아어 회화', '아랍어 회화', '베트남어 회화', '심화 독일어', '심화 프랑스어',
        '심화 스페인어', '심화 중국어', '심화 일본어', '심화 러시아어', '심화 아랍어',
        '심화 베트남어', '독일어권 문화', '프랑스어권 문화', '스페인어권 문화',
        '중국 문화', '일본 문화', '러시아 문화', '아랍 문화', '베트남 문화',
        '한문', '한문 고전 읽기', '언어생활과 한자'
    ],
    '교양': [
        '진로와 직업', '생태와 환경', '인간과 철학', '논리와 사고', '인간과 심리',
        '교육의 이해', '삶과 종교', '보건', '인간과 경제활동', '논술'
    ]
};

for (const [expectedGroup, subjects] of Object.entries(officialSubjects)) {
    for (const subject of subjects) {
        assert.equal(
            configuredAnalyzer.getSubjectGroup(subject),
            expectedGroup,
            `subjectGroups.json: ${subject}`
        );
        assert.equal(
            fallbackAnalyzer.getSubjectGroup(subject),
            expectedGroup,
            `default mapping: ${subject}`
        );
    }
}

for (const subject of ['중국어Ⅰ', '생활 중국어', '일본어Ⅰ', '생활 일본어']) {
    assert.equal(configuredAnalyzer.getSubjectGroup(subject), '제2외국어/한문', subject);
    assert.equal(fallbackAnalyzer.getSubjectGroup(subject), '제2외국어/한문', `default: ${subject}`);
}

const sourceGroupCases = [
    ['임의 과목', '사회(역사/도덕 포함)', '사회'],
    ['중국어', '제2외국어/한문', '제2외국어/한문'],
    ['데이터 과학', '정보', '기술·가정/정보'],
    ['임의 과목', '예술(음악/미술)', '예술'],
    ['미술', '체육·예술', '예술'],
    ['중국어', '기술·가정/정보/제2외국어/한문/교양', '제2외국어/한문'],
    ['중국어', '알 수 없는 교과', '제2외국어/한문']
];
for (const [subject, sourceGroup, expectedGroup] of sourceGroupCases) {
    assert.equal(
        configuredAnalyzer.getSubjectGroup(subject, sourceGroup),
        expectedGroup,
        `${sourceGroup} / ${subject}`
    );
}

const gradeReportData = [
    [],
    [],
    ['2026학년도 1학기 1학년 1반'],
    ['번호', '성명', '학년', '학기', '교과', '과목명', '학점', '원점수', '과목평균', '석차등급', '수강자수'],
    [1, '테스트 학생', 1, 1, '제2외국어/한문', '중국어', 3, 90, 80, 1, 100]
];
const parsedGradeReport = configuredAnalyzer.parseGradeReport(gradeReportData, 'grade-report.xls');
assert.equal(parsedGradeReport.subjects[0].sourceGroup, '제2외국어/한문');

const xlsData = [
    [],
    [],
    ['2026학년도 1학기 주간 1학년 1반'],
    ['', '', '', '중국어(3)'],
    ['', '', '', 80],
    ['', '', '', 'A(20)B(20)C(20)D(20)E(20)'],
    [1, '테스트 학생', '', '90(90)'],
    ['', '', '', 'A'],
    ['', '', '', 1],
    ['', '', '', 1],
    ['', '', '', 100]
];
const parsedXlsData = configuredAnalyzer.parseFileData(xlsData, 'xls-data.xls');
assert.equal(parsedXlsData.format, 'xls-data');
assert.equal(parsedXlsData.subjects[0].sourceGroup, undefined);
assert.equal(configuredAnalyzer.getSubjectGroup(parsedXlsData.subjects[0].name), '제2외국어/한문');

configuredAnalyzer.filesData = new Map([
    ['xls-data.xls', parsedXlsData],
    ['grade-report.xls', parsedGradeReport]
]);
configuredAnalyzer.combineAllData();
assert.equal(configuredAnalyzer.combinedData.subjects[0].sourceGroup, '제2외국어/한문');
assert.equal(
    configuredAnalyzer.getSubjectGroup(
        configuredAnalyzer.combinedData.subjects[0].name,
        configuredAnalyzer.combinedData.subjects[0].sourceGroup
    ),
    '제2외국어/한문'
);

const toPlainObject = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(toPlainObject(fallbackAnalyzer.subjectGroups.groups), configuredAnalyzer.subjectGroups.groups);
assert.deepEqual(toPlainObject(fallbackAnalyzer.subjectGroups.priorityKeywords), configuredAnalyzer.subjectGroups.priorityKeywords);
assert.deepEqual(toPlainObject(fallbackAnalyzer.subjectGroups.exactMatch), configuredAnalyzer.subjectGroups.exactMatch);

const officialSubjectCount = Object.values(officialSubjects)
    .reduce((total, subjects) => total + subjects.length, 0);
console.log(`2022 개정 교육과정 ${officialSubjectCount}개 과목 교과(군) 분류 테스트 통과`);
