// ================================================================
// 인쇄용 성적표(학기말 성적 인쇄 양식) 파서 패치
// 
// [적용 방법]
// 1. parseFileData() 메서드 첫 줄에 양식 감지 코드 삽입 (아래 STEP 1 참조)
// 2. parseAchievementDistribution() 메서드 뒤에 아래 메서드 7개 삽입 (STEP 2)
// ================================================================

// ================================================================
// STEP 1: parseFileData() 시작 부분에 아래 5줄 추가
// ================================================================
// 
// 기존:
//     parseFileData(data, fileName) {
//         const fileData = {
//
// 변경:
//     parseFileData(data, fileName) {
//         // ★ 양식 자동감지
//         const format = this.detectFileFormat(data);
//         if (format === 'grade-report') {
//             console.log(`[${fileName}] 인쇄용 성적표 양식 감지`);
//             return this.parseGradeReport(data, fileName);
//         }
//
//         const fileData = {
//

// ================================================================
// STEP 2: 아래 메서드 7개를 parseAchievementDistribution() 다음에 삽입
//         (parseStudentData() 앞)
// ================================================================

    // ────────────────────────────────────────────
    // 양식 자동감지
    // ────────────────────────────────────────────
    detectFileFormat(data) {
        if (!data || data.length < 5) return 'xls-data';

        const row4 = data[3]; // 엑셀 4행 (0-based index 3)
        if (!row4 || row4.length < 4) return 'xls-data';

        // 4행에서 인쇄용 양식의 헤더 키워드 매칭
        const knownHeaders = [
            '번호', '성명', '학년', '학기', '교과',
            '과목명', '과목', '학점', '단위수',
            '석차등급', '수강자수', '성취도', '원점수'
        ];
        let matchCount = 0;
        for (let c = 0; c < Math.min(row4.length, 20); c++) {
            const cell = String(row4[c] || '').replace(/\s+/g, '').trim();
            if (knownHeaders.some(h => cell.includes(h))) {
                matchCount++;
            }
        }

        // 4개 이상 헤더가 매칭되면 인쇄용 양식
        if (matchCount >= 4) return 'grade-report';

        // 기존 XLS data 양식: 4행에 "과목명(학점)" 패턴이 있는지 확인
        for (let c = 3; c < row4.length; c++) {
            const cell = String(row4[c] || '');
            if (/^.+\(\d+\)$/.test(cell.trim())) {
                return 'xls-data';
            }
        }

        return 'xls-data';
    }

    // ────────────────────────────────────────────
    // 인쇄용 양식 파서 (VBA maketemp 로직 재현)
    // ────────────────────────────────────────────
    parseGradeReport(data, fileName) {
        const fileData = {
            fileName: fileName,
            data: data,
            subjects: [],
            students: [],
            grade: 1,
            class: 1
        };

        // ── A3 셀에서 학년·반 추출 ──
        // "1학년 4반" 또는 "2025학년도 1학기 주간 1학년 4반" 등 다양한 패턴 대응
        if (data[2] && data[2][0]) {
            const info = String(data[2][0]);
            // "N학년도" 가 아닌 단독 "N학년" 매칭
            const gradeMatches = info.match(/(\d+)\s*학년/g);
            if (gradeMatches) {
                // 마지막 매칭 사용 ("2025학년도 ... 1학년" → 1)
                const last = gradeMatches[gradeMatches.length - 1];
                const m = last.match(/(\d+)/);
                if (m) {
                    const val = parseInt(m[1]);
                    // 4자리 이상이면 학년도이므로 무시
                    if (val < 10) fileData.grade = val;
                }
            }
            const classMatch = info.match(/(\d+)\s*반/);
            if (classMatch) fileData.class = parseInt(classMatch[1]);
            console.log(`[인쇄용 양식] ${fileData.grade}학년 ${fileData.class}반 감지`);
        }

        // ── 4행(헤더)에서 열 인덱스 자동 매핑 ──
        const headerRow = data[3] || [];
        const colMap = this._buildGradeReportColumnMap(headerRow);
        console.log('[인쇄용 양식] 열 매핑:', JSON.stringify(colMap));

        // ── 데이터 행 파싱 (5행~) ──
        let curNumber = null;
        let curName = null;
        let curSchoolYear = null;
        let curSemester = null;

        let is예체능 = false;
        let is진로선택 = false;

        const subjectMap = new Map();
        const studentMap = new Map();
        const subjectOrder = [];

        for (let i = 4; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const cellA = String(row[0] || '').trim();

            // ── 섹션 마커 감지 ──
            if (cellA.includes('체육') && (cellA.includes('예술') || cellA.includes('과학탐구실험'))) {
                is예체능 = true;
                continue;
            }
            if (cellA.includes('진로') && cellA.includes('선택')) {
                is진로선택 = true;
                continue;
            }
            // 다시 일반 과목 섹션으로 돌아오는 마커 (필요시 확장)
            if (cellA.startsWith('<') && !cellA.includes('체육') && !cellA.includes('진로')) {
                // 새 섹션 시작 - 트리거 리셋하지 않음 (VBA와 동일)
            }

            // ── 반복 헤더행 건너뛰기 ──
            if (this._isGradeReportHeaderRow(row, colMap)) continue;

            // ── 유효 데이터행 판별 ──
            const subjectName = this._grVal(row, colMap, 'subjectName');
            const creditsRaw = this._grVal(row, colMap, 'credits');
            if (!subjectName || String(subjectName).trim() === '') continue;
            const credits = parseFloat(creditsRaw);
            if (isNaN(credits)) continue;

            // ── Carry-forward: 번호·성명·학년·학기 ──
            const numVal = this._grVal(row, colMap, 'number');
            if (numVal !== undefined && numVal !== null && numVal !== '') {
                const parsed = parseInt(numVal);
                if (!isNaN(parsed)) {
                    curNumber = parsed;
                    const nameVal = this._grVal(row, colMap, 'name');
                    if (nameVal && String(nameVal).trim() !== '') {
                        curName = String(nameVal).trim();
                    }
                }
            }
            const yearVal = this._grVal(row, colMap, 'schoolYear');
            if (yearVal !== undefined && yearVal !== null && yearVal !== '') {
                const yp = parseInt(yearVal);
                if (!isNaN(yp)) curSchoolYear = yp;
            }
            const semVal = this._grVal(row, colMap, 'semester');
            if (semVal !== undefined && semVal !== null && semVal !== '') {
                const sp = parseInt(semVal);
                if (!isNaN(sp)) curSemester = sp;
            }

            if (curNumber === null) continue;

            // ── 과목 데이터 추출 ──
            const subName = String(subjectName).trim();
            const subjectGroup = String(this._grVal(row, colMap, 'subjectGroup') || '').trim();

            // 원점수 & 과목평균
            let rawScore = 0;
            let subjectAvg = 0;
            const rawScoreCell = this._grVal(row, colMap, 'rawScore');
            const avgCell = this._grVal(row, colMap, 'subjectAvg');

            if (rawScoreCell !== undefined && rawScoreCell !== null && rawScoreCell !== '') {
                const rawStr = String(rawScoreCell).trim();
                if (rawStr.includes('/')) {
                    // VBA 방식 복합 형식: "85/72.3(15.2)"
                    const parts = rawStr.split('/');
                    rawScore = parseFloat(parts[0]) || 0;
                    if (parts[1]) {
                        subjectAvg = parseFloat(parts[1].split('(')[0]) || 0;
                    }
                } else {
                    rawScore = parseFloat(rawStr) || 0;
                }
            }
            if (avgCell !== undefined && avgCell !== null && avgCell !== '' && subjectAvg === 0) {
                subjectAvg = parseFloat(avgCell) || 0;
            }

            // 성취도
            let achievement = '';
            if (is예체능 && colMap.achievement !== undefined) {
                // VBA: 예체능일 때 성취도열.Offset(i, -1)
                const achVal = this._grVal(row, colMap, 'achievement');
                if (achVal && String(achVal).trim() !== '') {
                    achievement = String(achVal).trim().charAt(0);
                } else if (colMap.achievement > 0) {
                    const altVal = row[colMap.achievement - 1];
                    if (altVal) achievement = String(altVal).trim().charAt(0);
                }
            } else {
                const achVal = this._grVal(row, colMap, 'achievement');
                if (achVal) achievement = String(achVal).trim().charAt(0);
            }

            // 석차등급 (숫자만 추출)
            let gradeRank = NaN;
            if (!is예체능) {
                const gradeRankRaw = this._grVal(row, colMap, 'gradeRank');
                if (gradeRankRaw !== undefined && gradeRankRaw !== null && gradeRankRaw !== '') {
                    const gm = String(gradeRankRaw).trim().match(/\d+/);
                    if (gm) gradeRank = parseInt(gm[0]);
                }
            }

            // 수강자수 (숫자만 추출)
            let totalStudents = NaN;
            if (!is예체능) {
                const totalRaw = this._grVal(row, colMap, 'totalStudents');
                if (totalRaw !== undefined && totalRaw !== null && totalRaw !== '') {
                    const tm = String(totalRaw).trim().match(/\d+/);
                    if (tm) totalStudents = parseInt(tm[0]);
                }
            }

            // 성취도별 분포비율
            const distRaw = this._grVal(row, colMap, 'achievementDist');

            // ── 과목 정보 수집 ──
            if (!subjectMap.has(subName)) {
                subjectMap.set(subName, {
                    name: subName,
                    credits: credits,
                    averages: [],
                    rawDistributions: [],
                    group: subjectGroup
                });
                subjectOrder.push(subName);
            }
            const subjectInfo = subjectMap.get(subName);
            if (subjectAvg > 0) subjectInfo.averages.push(subjectAvg);
            if (distRaw && String(distRaw).trim() !== '') {
                subjectInfo.rawDistributions.push(String(distRaw).trim());
            }

            // ── 학생 정보 수집 ──
            if (!studentMap.has(curNumber)) {
                studentMap.set(curNumber, {
                    number: curNumber,
                    name: curName || `학생${curNumber}`,
                    scores: {},
                    achievements: {},
                    grades: {},
                    ranks: {},
                    subjectTotals: {},
                    totalStudents: null
                });
            }
            const student = studentMap.get(curNumber);
            if (curName && curName !== `학생${curNumber}`) {
                student.name = curName;
            }

            student.scores[subName] = rawScore;
            if (achievement) student.achievements[subName] = achievement;

            if (!is예체능) {
                if (!isNaN(gradeRank)) student.grades[subName] = gradeRank;
                if (!isNaN(totalStudents)) {
                    student.subjectTotals[subName] = totalStudents;
                    if (!student.totalStudents || totalStudents > student.totalStudents) {
                        student.totalStudents = totalStudents;
                    }
                }
            }
        }

        // ── 과목 배열 구성 ──
        subjectOrder.forEach((subName, idx) => {
            const info = subjectMap.get(subName);
            const subject = {
                name: info.name,
                credits: info.credits,
                columnIndex: idx,
                average: info.averages.length > 0
                    ? info.averages.reduce((s, v) => s + v, 0) / info.averages.length
                    : 0,
                scores: []
            };
            if (info.rawDistributions.length > 0) {
                subject.distribution = this._parseAchievementDistString(info.rawDistributions[0]);
            }
            fileData.subjects.push(subject);
        });

        // ── 학생 배열 구성 ──
        studentMap.forEach(student => {
            student.weightedAverageGrade = this.calculateWeightedAverageGrade(student, fileData.subjects);
            student.weightedAverage9Grade = this.calculateWeightedAverage9Grade(student, fileData.subjects);
            fileData.students.push(student);
        });

        console.log(`[인쇄용 양식] 과목 ${fileData.subjects.length}개, 학생 ${fileData.students.length}명 파싱 완료`);
        return fileData;
    }

    // ────────────────────────────────────────────
    // 헬퍼: 헤더행에서 열 인덱스 자동 매핑
    // ────────────────────────────────────────────
    _buildGradeReportColumnMap(headerRow) {
        const colMap = {};
        const nameMap = [
            { keys: ['번호'], field: 'number' },
            { keys: ['성명', '이름'], field: 'name' },
            { keys: ['학년'], field: 'schoolYear' },
            { keys: ['학기'], field: 'semester' },
            { keys: ['교과'], field: 'subjectGroup' },
            { keys: ['과목명', '과목'], field: 'subjectName' },
            { keys: ['학점', '단위수', '단위'], field: 'credits' },
            { keys: ['원점수'], field: 'rawScore' },
            { keys: ['과목평균'], field: 'subjectAvg' },
            { keys: ['석차등급'], field: 'gradeRank' },
            { keys: ['수강자수'], field: 'totalStudents' },
            { keys: ['성취도별분포비율', '성취도별 분포비율', '분포비율'], field: 'achievementDist' },
        ];

        // 1차: 정확한 매칭
        for (let c = 0; c < headerRow.length; c++) {
            const raw = String(headerRow[c] || '').replace(/\s+/g, '').trim();
            if (!raw) continue;
            for (const mapping of nameMap) {
                if (colMap[mapping.field] !== undefined) continue;
                for (const key of mapping.keys) {
                    if (raw === key.replace(/\s+/g, '')) {
                        colMap[mapping.field] = c;
                        break;
                    }
                }
            }
        }

        // 2차: 부분 매칭 (아직 안 잡힌 필드)
        for (let c = 0; c < headerRow.length; c++) {
            const raw = String(headerRow[c] || '').replace(/\s+/g, '').trim();
            if (!raw) continue;
            for (const mapping of nameMap) {
                if (colMap[mapping.field] !== undefined) continue;
                for (const key of mapping.keys) {
                    if (raw.includes(key.replace(/\s+/g, ''))) {
                        colMap[mapping.field] = c;
                        break;
                    }
                }
            }
        }

        // 성취도: "성취도"를 포함하되 "분포"와 "비율"은 포함하지 않는 열
        if (colMap.achievement === undefined) {
            for (let c = 0; c < headerRow.length; c++) {
                const raw = String(headerRow[c] || '').replace(/\s+/g, '').trim();
                if (raw.includes('성취도') && !raw.includes('분포') && !raw.includes('비율')) {
                    colMap.achievement = c;
                    break;
                }
            }
        }

        // 과목평균 열이 "평균"으로만 되어있을 수 있음
        if (colMap.subjectAvg === undefined) {
            for (let c = 0; c < headerRow.length; c++) {
                const raw = String(headerRow[c] || '').replace(/\s+/g, '').trim();
                if (raw === '평균' && c !== colMap.rawScore) {
                    colMap.subjectAvg = c;
                    break;
                }
            }
        }

        // 원점수 열이 없으면 학점 열 + 1 (VBA 단위수열.Offset(i,1) 방식)
        if (colMap.rawScore === undefined && colMap.credits !== undefined) {
            colMap.rawScore = colMap.credits + 1;
        }

        return colMap;
    }

    // ────────────────────────────────────────────
    // 헬퍼: 반복 헤더행 판별
    // ────────────────────────────────────────────
    _isGradeReportHeaderRow(row, colMap) {
        const cellA = String(row[0] || '').trim();
        if (cellA === '번호') return true;

        if (colMap.subjectName !== undefined) {
            const val = String(row[colMap.subjectName] || '').trim();
            if (val === '과목명' || val === '과목') return true;
        }
        if (colMap.credits !== undefined) {
            const val = String(row[colMap.credits] || '').trim();
            if (val === '학점' || val === '단위수') return true;
        }
        return false;
    }

    // ────────────────────────────────────────────
    // 헬퍼: 셀 값 읽기
    // ────────────────────────────────────────────
    _grVal(row, colMap, field) {
        if (colMap[field] === undefined) return undefined;
        return row[colMap[field]];
    }

    // ────────────────────────────────────────────
    // 헬퍼: 성취도별 분포비율 문자열 파싱
    // "A(6.3)B(15.3)C(12.6)D(18.9)E(46.8)" 형식
    // ────────────────────────────────────────────
    _parseAchievementDistString(str) {
        const distribution = {};
        if (!str) return distribution;
        const matches = str.match(/[ABCDE]\s*\(\s*\d+\.?\d*\s*\)/g);
        if (matches) {
            matches.forEach(match => {
                const m = match.match(/([ABCDE])\s*\(\s*(\d+\.?\d*)\s*\)/);
                if (m) distribution[m[1]] = parseFloat(m[2]);
            });
        }
        return distribution;
    }
