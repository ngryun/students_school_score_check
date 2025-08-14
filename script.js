class ScoreAnalyzer {
    constructor() {
        this.filesData = new Map(); // 파일명 -> 분석 데이터 매핑
        this.combinedData = null; // 통합된 분석 데이터
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('excelFiles');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const tabBtns = document.querySelectorAll('.tab-btn');
        const studentSearch = document.getElementById('studentSearch');
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentSelect = document.getElementById('studentSelect');
        const showStudentDetail = document.getElementById('showStudentDetail');
        const tableViewBtn = document.getElementById('tableViewBtn');
        const detailViewBtn = document.getElementById('detailViewBtn');

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                this.displayFileList(files);
                analyzeBtn.disabled = false;
                this.hideError();
            }
        });

        analyzeBtn.addEventListener('click', () => {
            this.analyzeFiles();
        });

        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        studentSearch.addEventListener('input', (e) => {
            this.filterStudents(e.target.value);
        });

        gradeSelect.addEventListener('change', () => {
            this.updateClassOptions();
            this.updateStudentOptions();
        });

        classSelect.addEventListener('change', () => {
            this.updateStudentOptions();
        });

        studentSelect.addEventListener('change', () => {
            showStudentDetail.disabled = !studentSelect.value;
        });

        showStudentDetail.addEventListener('click', () => {
            this.showStudentDetail();
        });

        tableViewBtn.addEventListener('click', () => {
            this.switchView('table');
        });

        detailViewBtn.addEventListener('click', () => {
            this.switchView('detail');
        });
    }

    displayFileList(files) {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<h4>선택된 파일:</h4>';
        
        const ul = document.createElement('ul');
        files.forEach(file => {
            const li = document.createElement('li');
            li.textContent = file.name;
            ul.appendChild(li);
        });
        
        fileList.appendChild(ul);
        fileList.style.display = 'block';
    }

    async analyzeFiles() {
        const fileInput = document.getElementById('excelFiles');
        const files = Array.from(fileInput.files);
        
        if (files.length === 0) {
            this.showError('파일을 선택해주세요.');
            return;
        }

        this.showLoading();
        
        try {
            this.filesData.clear();
            
            for (const file of files) {
                const data = await this.readExcelFile(file);
                const fileData = this.parseFileData(data, file.name);
                this.filesData.set(file.name, fileData);
            }
            
            this.combineAllData();
            this.displayResults();
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showError('파일 분석 중 오류가 발생했습니다: ' + error.message);
        }
    }

    combineAllData() {
        if (this.filesData.size === 0) return;

        this.combinedData = {
            subjects: [],
            students: [],
            fileNames: Array.from(this.filesData.keys())
        };

        // 모든 과목을 통합 (중복 제거)
        const subjectMap = new Map();
        this.filesData.forEach((fileData) => {
            fileData.subjects.forEach(subject => {
                const key = `${subject.name}-${subject.credits}`;
                if (!subjectMap.has(key)) {
                    subjectMap.set(key, {
                        name: subject.name,
                        credits: subject.credits,
                        averages: [],
                        distributions: [],
                        columnIndex: subject.columnIndex
                    });
                }
                // 각 파일의 평균과 분포 저장
                subjectMap.get(key).averages.push(subject.average || 0);
                if (subject.distribution) {
                    subjectMap.get(key).distributions.push(subject.distribution);
                }
            });
        });

        // 과목별 전체 평균 계산
        subjectMap.forEach(subject => {
            subject.average = subject.averages.length > 0 
                ? subject.averages.reduce((sum, avg) => sum + avg, 0) / subject.averages.length 
                : 0;
            
            // 분포도 평균 계산
            if (subject.distributions.length > 0) {
                subject.distribution = {};
                const grades = ['A', 'B', 'C', 'D', 'E'];
                grades.forEach(grade => {
                    const values = subject.distributions
                        .map(dist => dist[grade] || 0)
                        .filter(val => val > 0);
                    subject.distribution[grade] = values.length > 0 
                        ? values.reduce((sum, val) => sum + val, 0) / values.length 
                        : 0;
                });
            }
        });

        this.combinedData.subjects = Array.from(subjectMap.values());

        // 모든 학생 데이터 통합
        let studentCounter = 1;
        this.filesData.forEach((fileData, fileName) => {
            fileData.students.forEach(student => {
                const fileNameParts = fileName.split('.')[0];
                
                const combinedStudent = {
                    ...student,
                    number: studentCounter++,
                    originalNumber: student.number,
                    originalName: student.name, // 원본 이름 보존
                    fileName: fileName,
                    name: student.name, // 실제 학생 이름 사용
                    displayName: `${fileData.grade}학년${fileData.class}반-${student.name}`, // 표시용 이름
                    grade: fileData.grade, // 파일의 A3 셀에서 추출한 학년
                    class: fileData.class, // 파일의 A3 셀에서 추출한 반
                    percentiles: {}
                };
                this.combinedData.students.push(combinedStudent);
            });
        });

        // 과목별 백분위 계산
        this.calculatePercentiles();
    }

    calculatePercentiles() {
        if (!this.combinedData) return;

        this.combinedData.subjects.forEach(subject => {
            // 해당 과목의 석차가 있는 모든 학생 수집
            const studentsWithRanks = this.combinedData.students
                .filter(student => {
                    const rank = student.ranks[subject.name];
                    return rank !== undefined && rank !== null && !isNaN(rank);
                })
                .map(student => ({
                    student: student,
                    rank: student.ranks[subject.name]
                }))
                .sort((a, b) => a.rank - b.rank); // 석차 순으로 정렬

            if (studentsWithRanks.length === 0) return;

            const totalStudents = studentsWithRanks.length;

            // 각 학생의 백분위 계산
            studentsWithRanks.forEach((item, index) => {
                const studentRank = item.rank;
                
                // 같은 석차의 학생들 찾기
                const sameRankStudents = studentsWithRanks.filter(s => s.rank === studentRank);
                const sameRankCount = sameRankStudents.length;
                
                // 해당 석차보다 좋은 석차의 학생 수
                const betterRankCount = studentsWithRanks.filter(s => s.rank < studentRank).length;
                
                // 백분위 계산: (더 좋은 석차 학생 수 + 동점자의 절반) / 전체 학생 수 * 100
                const percentile = ((betterRankCount + (sameRankCount - 1) / 2) / totalStudents) * 100;
                
                // 0~100 범위로 제한하고 반올림
                const finalPercentile = Math.max(0, Math.min(100, Math.round(percentile)));
                
                item.student.percentiles[subject.name] = finalPercentile;
            });
        });
    }

    readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsArrayBuffer(file);
        });
    }

    parseFileData(data, fileName) {
        const fileData = {
            fileName: fileName,
            data: data,
            subjects: [],
            students: [],
            grade: 1,
            class: 1
        };

        // A3 셀에서 학년/반 정보 추출 (0-based index로는 행 2, 열 0)
        if (data[2] && data[2][0]) {
            const classInfo = data[2][0].toString();
            console.log('A3 셀 내용:', classInfo); // 디버깅용
            
            // "학년도" 뒤에 오는 학년 정보와 "반" 앞에 오는 반 정보 추출
            // 예: "2025학년도   1학기   주간      1학년     4반"
            const gradeMatch = classInfo.match(/\s+(\d+)학년/);
            const classMatch = classInfo.match(/\s+(\d+)반/);
            
            if (gradeMatch) {
                fileData.grade = parseInt(gradeMatch[1]);
                console.log('추출된 학년:', fileData.grade); // 디버깅용
            }
            if (classMatch) {
                fileData.class = parseInt(classMatch[1]);
                console.log('추출된 반:', fileData.class); // 디버깅용
            }
        }

        // 과목명 추출 (행 4, D열부터) - 0-based index로는 행 3
        const subjectRow = data[3]; // 행 4
        for (let i = 3; i < subjectRow.length; i++) { // D열부터
            const cellValue = subjectRow[i];
            if (cellValue && typeof cellValue === 'string' && cellValue.includes('(')) {
                const match = cellValue.match(/^(.+)\((\d+)\)$/);
                if (match) {
                    fileData.subjects.push({
                        name: match[1].trim(),
                        credits: parseInt(match[2]),
                        columnIndex: i,
                        scores: []
                    });
                }
            }
        }

        // 과목별 평균 (행 5) - 0-based index로는 행 4
        const averageRow = data[4];
        fileData.subjects.forEach(subject => {
            const avgValue = averageRow[subject.columnIndex];
            subject.average = avgValue ? parseFloat(avgValue) : 0;
        });

        // 성취도 분포 (행 6) - 0-based index로는 행 5
        const distributionRow = data[5];
        this.parseAchievementDistribution(distributionRow, fileData.subjects);

        // 학생 데이터 파싱 (행 7부터 시작, 5행씩 묶여있음)
        this.parseStudentData(data, fileData);

        return fileData;
    }

    parseAchievementDistribution(distributionRow, subjects) {
        subjects.forEach(subject => {
            subject.distribution = {};
            const cellValue = distributionRow[subject.columnIndex];
            
            if (cellValue && typeof cellValue === 'string') {
                // "A(6.3)B(15.3)C(12.6)D(18.9)E(46.8)" 형식에서 각 등급과 비율 추출
                const gradeMatches = cellValue.match(/[ABCDE]\(\d+\.?\d*\)/g);
                if (gradeMatches) {
                    gradeMatches.forEach(match => {
                        const gradeMatch = match.match(/([ABCDE])\((\d+\.?\d*)\)/);
                        if (gradeMatch) {
                            const grade = gradeMatch[1];
                            const percentage = parseFloat(gradeMatch[2]);
                            subject.distribution[grade] = percentage;
                        }
                    });
                }
            }
        });
    }

    parseStudentData(data, fileData) {
        // 학생 데이터는 행 7부터 시작해서 각 학생마다 5행씩 사용
        // 행 7: 번호 + 합계(원점수)
        // 행 8: 성취도
        // 행 9: 석차등급  
        // 행 10: 석차
        // 행 11: 수강자수
        
        for (let i = 6; i < data.length; i += 5) { // 0-based로 행 7부터, 5행씩 건너뛰기
            const scoreRow = data[i];     // 합계(원점수) 행
            const achievementRow = data[i + 1]; // 성취도 행
            const gradeRow = data[i + 2];       // 석차등급 행
            const rankRow = data[i + 3];        // 석차 행
            const totalRow = data[i + 4];       // 수강자수 행
            
            // 학생 번호가 있는지 확인 (A열)
            if (!scoreRow || !scoreRow[0] || isNaN(scoreRow[0])) break;
            
            const student = {
                number: scoreRow[0],
                name: scoreRow[1] || `학생${scoreRow[0]}`, // B열에서 학생 이름 추출
                scores: {},
                achievements: {},
                grades: {},
                ranks: {},
                totalStudents: null
            };

            // 각 과목별 데이터 추출
            fileData.subjects.forEach(subject => {
                const colIndex = subject.columnIndex;
                
                // 점수 (원점수 추출)
                if (scoreRow[colIndex]) {
                    const scoreText = scoreRow[colIndex].toString();
                    const scoreMatch = scoreText.match(/(\d+\.?\d*)\((\d+)\)/);
                    if (scoreMatch) {
                        student.scores[subject.name] = parseFloat(scoreMatch[2]); // 원점수
                    }
                }
                
                // 성취도
                if (achievementRow && achievementRow[colIndex]) {
                    student.achievements[subject.name] = achievementRow[colIndex];
                }
                
                // 석차등급
                if (gradeRow && gradeRow[colIndex] && !isNaN(gradeRow[colIndex])) {
                    student.grades[subject.name] = parseInt(gradeRow[colIndex]);
                }
                
                // 석차
                if (rankRow && rankRow[colIndex] && !isNaN(rankRow[colIndex])) {
                    student.ranks[subject.name] = parseInt(rankRow[colIndex]);
                }
                
                // 수강자수 (첫 번째 과목에서만 가져오기)
                if (!student.totalStudents && totalRow && totalRow[colIndex] && !isNaN(totalRow[colIndex])) {
                    student.totalStudents = parseInt(totalRow[colIndex]);
                }
            });

            // 가중평균등급 계산
            student.weightedAverageGrade = this.calculateWeightedAverageGrade(student, fileData.subjects);
            
            fileData.students.push(student);
        }
    }

    calculateWeightedAverageGrade(student, subjects) {
        let totalGradePoints = 0;
        let totalCredits = 0;
        
        subjects.forEach(subject => {
            const grade = student.grades[subject.name];
            if (grade && !isNaN(grade)) {
                totalGradePoints += grade * subject.credits;
                totalCredits += subject.credits;
            }
        });
        
        return totalCredits > 0 ? totalGradePoints / totalCredits : null;
    }

    calculateWeightedAveragePercentile(student, subjects) {
        let totalPercentilePoints = 0;
        let totalCredits = 0;
        
        subjects.forEach(subject => {
            const percentile = student.percentiles[subject.name];
            const rank = student.ranks[subject.name];
            // 석차가 있는 과목만 계산에 포함 (석차 기준으로 백분위 계산했으므로)
            if (percentile !== undefined && percentile !== null && rank !== undefined && rank !== null && !isNaN(rank)) {
                totalPercentilePoints += percentile * subject.credits;
                totalCredits += subject.credits;
            }
        });
        
        return totalCredits > 0 ? totalPercentilePoints / totalCredits : null;
    }


    displayResults() {
        document.getElementById('results').style.display = 'block';
        this.displaySubjectAverages();
        this.displayGradeAnalysis();
        this.displayStudentAnalysis();
    }

    displaySubjectAverages() {
        const container = document.getElementById('subjectAverages');
        container.innerHTML = '';

        if (!this.combinedData) return;

        this.combinedData.subjects.forEach(subject => {
            const subjectDiv = document.createElement('div');
            subjectDiv.className = 'subject-item';
            
            // 성취도 분포 HTML 생성
            let distributionHTML = '';
            if (subject.distribution) {
                distributionHTML = '<div class="achievement-bars">';
                Object.entries(subject.distribution).forEach(([grade, percentage]) => {
                    distributionHTML += `
                        <div class="achievement-bar">
                            <span class="achievement-label">${grade}</span>
                            <div class="achievement-bar-container">
                                <div class="achievement-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <span class="achievement-percentage">${percentage.toFixed(1)}%</span>
                        </div>
                    `;
                });
                distributionHTML += '</div>';
            }
            
            subjectDiv.innerHTML = `
                <div class="subject-header">
                    <h3>${subject.name}</h3>
                    <span class="credits">${subject.credits}학점</span>
                </div>
                <div class="average-score">
                    <span class="score">${subject.average?.toFixed(1) || 'N/A'}</span>
                    <span class="label">평균 점수</span>
                </div>
                ${distributionHTML}
            `;
            container.appendChild(subjectDiv);
        });
    }


    displayGradeAnalysis() {
        if (!this.combinedData) return;

        // 평균등급이 있는 학생들만 필터링
        const studentsWithGrades = this.combinedData.students.filter(student => 
            student.weightedAverageGrade !== null
        );

        if (studentsWithGrades.length === 0) {
            return;
        }

        // 통계 계산
        const grades = studentsWithGrades.map(student => student.weightedAverageGrade);
        const overallAverage = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
        const variance = grades.reduce((sum, grade) => sum + Math.pow(grade - overallAverage, 2), 0) / grades.length;
        const standardDeviation = Math.sqrt(variance);
        const bestGrade = Math.min(...grades);
        const worstGrade = Math.max(...grades);

        // 통계 표시
        document.getElementById('overallAverage').textContent = overallAverage.toFixed(2);
        document.getElementById('standardDeviation').textContent = standardDeviation.toFixed(2);
        document.getElementById('bestGrade').textContent = bestGrade.toFixed(2);
        document.getElementById('worstGrade').textContent = worstGrade.toFixed(2);

        // 산점도 생성
        this.createScatterChart(studentsWithGrades);

        // 막대그래프 생성
        this.createGradeDistributionChart(studentsWithGrades);
    }

    createScatterChart(students) {
        const ctx = document.getElementById('scatterChart').getContext('2d');
        
        // 기존 차트가 있다면 파괴
        if (this.scatterChart) {
            this.scatterChart.destroy();
        }

        // 각 평균등급별로 같은 등급의 학생 수만큼 Y축에 분산
        const gradeGroups = {};
        students.forEach(student => {
            const grade = student.weightedAverageGrade.toFixed(2);
            if (!gradeGroups[grade]) {
                gradeGroups[grade] = [];
            }
            gradeGroups[grade].push(student);
        });

        const data = [];
        Object.keys(gradeGroups).forEach(grade => {
            const studentsInGrade = gradeGroups[grade];
            studentsInGrade.forEach((student, index) => {
                // 같은 등급의 학생들을 Y축에서 약간씩 분산 (중앙 기준으로 ±0.05 범위)
                const yOffset = studentsInGrade.length > 1 
                    ? (index - (studentsInGrade.length - 1) / 2) * 0.02 
                    : 0;
                
                data.push({
                    x: parseFloat(grade),
                    y: 0.5 + yOffset, // Y축 중앙(0.5) 기준으로 약간 분산
                    student: student
                });
            });
        });

        this.scatterChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '학생별 평균등급',
                    data: data,
                    backgroundColor: function(context) {
                        const grade = context.parsed.x;
                        if (grade <= 1.5) return 'rgba(26, 188, 156, 0.8)';
                        if (grade <= 2.0) return 'rgba(52, 152, 219, 0.8)';
                        if (grade <= 2.5) return 'rgba(155, 89, 182, 0.8)';
                        if (grade <= 3.0) return 'rgba(241, 196, 15, 0.8)';
                        if (grade <= 3.5) return 'rgba(230, 126, 34, 0.8)';
                        if (grade <= 4.0) return 'rgba(231, 76, 60, 0.8)';
                        if (grade <= 4.5) return 'rgba(189, 195, 199, 0.8)';
                        return 'rgba(127, 140, 141, 0.8)';
                    },
                    borderColor: function(context) {
                        const grade = context.parsed.x;
                        if (grade <= 1.5) return 'rgba(26, 188, 156, 1)';
                        if (grade <= 2.0) return 'rgba(52, 152, 219, 1)';
                        if (grade <= 2.5) return 'rgba(155, 89, 182, 1)';
                        if (grade <= 3.0) return 'rgba(241, 196, 15, 1)';
                        if (grade <= 3.5) return 'rgba(230, 126, 34, 1)';
                        if (grade <= 4.0) return 'rgba(231, 76, 60, 1)';
                        if (grade <= 4.5) return 'rgba(189, 195, 199, 1)';
                        return 'rgba(127, 140, 141, 1)';
                    },
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    borderWidth: 2,
                    pointHoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 20,
                        bottom: 20,
                        left: 10,
                        right: 10
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: '평균등급',
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 14,
                                weight: '600'
                            },
                            color: '#2c3e50'
                        },
                        min: 1,
                        max: 5,
                        reverse: true,
                        ticks: {
                            stepSize: 0.5,
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 12
                            },
                            color: '#5a6c7d'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.08)',
                            lineWidth: 1
                        }
                    },
                    y: {
                        display: false,
                        min: 0,
                        max: 1
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(52, 152, 219, 0.8)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: true,
                        titleFont: {
                            family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                            size: 14,
                            weight: '600'
                        },
                        bodyFont: {
                            family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                            size: 13
                        },
                        callbacks: {
                            title: function(context) {
                                const student = context[0].raw.student;
                                return `${student.name}`;
                            },
                            label: function(context) {
                                return `평균등급: ${context.parsed.x.toFixed(2)}`;
                            }
                        }
                    }
                },
                interaction: {
                    intersect: true,
                    mode: 'point'
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutCubic'
                }
            }
        });
    }

    createGradeDistributionChart(students) {
        const ctx = document.getElementById('barChart').getContext('2d');
        
        // 기존 차트가 있다면 파괴
        if (this.barChart) {
            this.barChart.destroy();
        }

        // 등급 구간별 분류
        const intervals = [
            { label: '1.0~1.5미만', min: 1.0, max: 1.5, count: 0 },
            { label: '1.5~2.0미만', min: 1.5, max: 2.0, count: 0 },
            { label: '2.0~2.5미만', min: 2.0, max: 2.5, count: 0 },
            { label: '2.5~3.0미만', min: 2.5, max: 3.0, count: 0 },
            { label: '3.0~3.5미만', min: 3.0, max: 3.5, count: 0 },
            { label: '3.5~4.0미만', min: 3.5, max: 4.0, count: 0 },
            { label: '4.0~4.5미만', min: 4.0, max: 4.5, count: 0 },
            { label: '4.5~5.0', min: 4.5, max: 5.0, count: 0 }
        ];

        students.forEach(student => {
            const grade = student.weightedAverageGrade;
            intervals.forEach(interval => {
                if (grade >= interval.min && (grade < interval.max || (interval.max === 5.0 && grade <= interval.max))) {
                    interval.count++;
                }
            });
        });

        // 누적 비율 계산 (1등급부터 누적 = 상위권부터 누적)
        const totalStudents = students.length;
        let cumulative = 0;
        const cumulativePercentages = intervals.map(interval => {
            cumulative += interval.count;
            return totalStudents > 0 ? (cumulative / totalStudents) * 100 : 0;
        });

        this.barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: intervals.map(interval => interval.label),
                datasets: [{
                    label: '학생 수',
                    data: intervals.map(interval => interval.count),
                    backgroundColor: [
                        'rgba(26, 188, 156, 0.85)',  // 1.0-1.5 민트 그린
                        'rgba(52, 152, 219, 0.85)',  // 1.5-2.0 블루
                        'rgba(155, 89, 182, 0.85)',  // 2.0-2.5 퍼플
                        'rgba(241, 196, 15, 0.85)',  // 2.5-3.0 옐로우
                        'rgba(230, 126, 34, 0.85)',  // 3.0-3.5 오렌지
                        'rgba(231, 76, 60, 0.85)',   // 3.5-4.0 레드
                        'rgba(189, 195, 199, 0.85)', // 4.0-4.5 라이트 그레이
                        'rgba(127, 140, 141, 0.85)'  // 4.5-5.0 다크 그레이
                    ],
                    borderColor: [
                        'rgba(26, 188, 156, 1)',
                        'rgba(52, 152, 219, 1)',
                        'rgba(155, 89, 182, 1)',
                        'rgba(241, 196, 15, 1)',
                        'rgba(230, 126, 34, 1)',
                        'rgba(231, 76, 60, 1)',
                        'rgba(189, 195, 199, 1)',
                        'rgba(127, 140, 141, 1)'
                    ],
                    borderWidth: 2,
                    borderRadius: 4,
                    borderSkipped: false,
                    yAxisID: 'y'
                }, {
                    label: '누적 비율',
                    type: 'line',
                    data: cumulativePercentages,
                    borderColor: 'rgba(231, 76, 60, 1)',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: 'rgba(231, 76, 60, 1)',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 20,
                        bottom: 10
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '학생 수 (명)',
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 14,
                                weight: '600'
                            },
                            color: '#2c3e50'
                        },
                        ticks: {
                            stepSize: 1,
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 12
                            },
                            color: '#5a6c7d'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.08)',
                            lineWidth: 1
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        max: 100,
                        title: {
                            display: true,
                            text: '누적 비율 (%)',
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 14,
                                weight: '600'
                            },
                            color: '#e74c3c'
                        },
                        ticks: {
                            stepSize: 20,
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 12
                            },
                            color: '#e74c3c',
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        grid: {
                            display: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '등급 구간',
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 14,
                                weight: '600'
                            },
                            color: '#2c3e50'
                        },
                        ticks: {
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 12,
                                weight: '500'
                            },
                            color: '#5a6c7d'
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 13,
                                weight: '500'
                            },
                            color: '#2c3e50',
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(52, 152, 219, 0.8)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: true,
                        titleFont: {
                            family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                            size: 14,
                            weight: '600'
                        },
                        bodyFont: {
                            family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                            size: 13
                        },
                        callbacks: {
                            title: function(context) {
                                return `등급 구간: ${context[0].label}`;
                            },
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    // 막대그래프 (학생 수)
                                    const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                                    const percentage = total > 0 ? ((context.parsed.y / total) * 100).toFixed(1) : 0;
                                    return `학생 수: ${context.parsed.y}명 (${percentage}%)`;
                                } else {
                                    // 선 그래프 (누적 비율)
                                    return `누적 비율: ${context.parsed.y.toFixed(1)}%`;
                                }
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                animation: {
                    duration: 1200,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    displayStudentAnalysis() {
        if (!this.combinedData) return;

        this.populateStudentSelectors();
        const container = document.getElementById('studentTable');
        this.renderStudentTable(this.combinedData.students, this.combinedData.subjects, container);
    }

    populateStudentSelectors() {
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        
        // 학년 옵션 생성
        const grades = [...new Set(this.combinedData.students.map(s => s.grade))].sort();
        gradeSelect.innerHTML = '<option value="">전체</option>';
        grades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = `${grade}학년`;
            gradeSelect.appendChild(option);
        });

        // 반 옵션 생성 (전체)
        const classes = [...new Set(this.combinedData.students.map(s => s.class))].sort();
        classSelect.innerHTML = '<option value="">전체</option>';
        classes.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls;
            option.textContent = `${cls}반`;
            classSelect.appendChild(option);
        });

        this.updateStudentOptions();
    }

    updateClassOptions() {
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const selectedGrade = gradeSelect.value;

        let students = this.combinedData.students;
        if (selectedGrade) {
            students = students.filter(s => s.grade == selectedGrade);
        }

        const classes = [...new Set(students.map(s => s.class))].sort();
        classSelect.innerHTML = '<option value="">전체</option>';
        classes.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls;
            option.textContent = `${cls}반`;
            classSelect.appendChild(option);
        });
    }

    updateStudentOptions() {
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentSelect = document.getElementById('studentSelect');
        
        const selectedGrade = gradeSelect.value;
        const selectedClass = classSelect.value;

        let students = this.combinedData.students;
        if (selectedGrade) {
            students = students.filter(s => s.grade == selectedGrade);
        }
        if (selectedClass) {
            students = students.filter(s => s.class == selectedClass);
        }

        studentSelect.innerHTML = '<option value="">학생 선택</option>';
        students.forEach(student => {
            const option = document.createElement('option');
            option.value = student.number;
            option.textContent = `${student.originalNumber}번 - ${student.name}`;
            studentSelect.appendChild(option);
        });
        
        document.getElementById('showStudentDetail').disabled = true;
    }

    renderStudentTable(students, subjects, container) {
        container.innerHTML = '';

        if (students.length === 0) {
            container.innerHTML = '<p>학생 데이터가 없습니다.</p>';
            return;
        }

        // 학생 카드 방식으로 변경
        const studentsGrid = document.createElement('div');
        studentsGrid.className = 'students-grid';

        students.forEach(student => {
            const studentCard = document.createElement('div');
            studentCard.className = 'student-card';
            
            // 평균 백분위 계산
            const weightedAveragePercentile = this.calculateWeightedAveragePercentile(student, subjects);
            
            // 과목별 정보를 간단하게 표시
            let subjectsHTML = '';
            let hasGradeSubjects = 0;
            
            subjects.forEach(subject => {
                const score = student.scores[subject.name];
                const achievement = student.achievements[subject.name];
                const grade = student.grades[subject.name];
                const percentile = student.percentiles[subject.name];
                
                if (score !== undefined && score !== null) {
                    const hasGrade = grade !== undefined && grade !== null && grade !== 'N/A' && !isNaN(grade);
                    if (hasGrade) hasGradeSubjects++;
                    
                    subjectsHTML += `
                        <div class="subject-row ${hasGrade ? '' : 'no-grade'}">
                            <span class="subject-name">${subject.name}</span>
                            <div class="subject-data">
                                <span class="subject-score">${score}점</span>
                                ${achievement ? `<span class="subject-achievement achievement ${achievement}">${achievement}</span>` : ''}
                                ${hasGrade ? `<span class="subject-grade">${grade}등급</span>` : ''}
                                ${hasGrade && percentile ? `<span class="subject-percentile">${percentile}%</span>` : ''}
                            </div>
                        </div>
                    `;
                }
            });
            
            studentCard.innerHTML = `
                <div class="student-card-header">
                    <div class="student-basic-info">
                        <h4>${student.name}</h4>
                        <span class="student-number">${student.grade}학년 ${student.class}반 ${student.originalNumber}번</span>
                    </div>
                    <div class="student-summary">
                        <div class="summary-metric">
                            <span class="metric-label">평균등급</span>
                            <span class="metric-value">${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                        </div>
                        ${weightedAveragePercentile ? `
                        <div class="summary-metric">
                            <span class="metric-label">평균백분위</span>
                            <span class="metric-value">${weightedAveragePercentile.toFixed(1)}%</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="student-subjects">
                    ${subjectsHTML}
                </div>
                <div class="student-card-footer">
                    <span class="grade-subjects-count">등급 산출 과목: ${hasGradeSubjects}개</span>
                    <button class="view-detail-btn" onclick="this.closest('.students-grid').parentElement.parentElement.parentElement.querySelector('#studentSelect').value='${student.number}'; this.closest('.students-grid').parentElement.parentElement.parentElement.querySelector('#showStudentDetail').click();">
                        상세 보기
                    </button>
                </div>
            `;
            
            studentsGrid.appendChild(studentCard);
        });

        container.appendChild(studentsGrid);
    }

    filterStudents(searchTerm) {
        if (!this.combinedData) return;

        const filtered = this.combinedData.students.filter(student => 
            student.number.toString().includes(searchTerm) || 
            student.name.includes(searchTerm) ||
            student.fileName.includes(searchTerm)
        );
        
        const container = document.getElementById('studentTable');
        this.renderStudentTable(filtered, this.combinedData.subjects, container);
    }

    switchTab(tabName) {
        // 탭 버튼 활성화
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 탭 내용 표시
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    switchView(viewType) {
        const tableViewBtn = document.getElementById('tableViewBtn');
        const detailViewBtn = document.getElementById('detailViewBtn');
        const tableView = document.getElementById('tableView');
        const detailView = document.getElementById('detailView');

        if (viewType === 'table') {
            tableViewBtn.classList.add('active');
            detailViewBtn.classList.remove('active');
            tableView.style.display = 'block';
            detailView.style.display = 'none';
        } else {
            tableViewBtn.classList.remove('active');
            detailViewBtn.classList.add('active');
            tableView.style.display = 'none';
            detailView.style.display = 'block';
        }
    }

    showStudentDetail() {
        const studentSelect = document.getElementById('studentSelect');
        const selectedStudentId = studentSelect.value;
        
        if (!selectedStudentId) return;

        const student = this.combinedData.students.find(s => s.number == selectedStudentId);
        if (!student) return;

        this.renderStudentDetail(student);
        this.switchView('detail');
    }

    renderStudentDetail(student) {
        const container = document.getElementById('studentDetailContent');
        
        // 학점 가중 평균 백분위 계산
        const weightedAveragePercentile = this.calculateWeightedAveragePercentile(student, this.combinedData.subjects);
        
        const html = `
            <div class="student-detail-header">
                <div class="student-info">
                    <h3>${student.name}</h3>
                    <div class="student-meta">
                        <span class="grade-class">${student.grade}학년 ${student.class}반 ${student.originalNumber}번</span>
                        <span class="file-info">출처: ${student.fileName}</span>
                    </div>
                </div>
                <div class="overall-stats">
                    <div class="stat-card">
                        <span class="stat-label">평균등급</span>
                        <span class="stat-value grade">${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">전체 학생수</span>
                        <span class="stat-value">${student.totalStudents || 'N/A'}명</span>
                    </div>
                </div>
            </div>
            
            <div class="student-detail-content">
                <div class="analysis-overview">
                    <div class="student-summary">
                        <div class="summary-card">
                            <div class="summary-header">
                                <h4>학생 정보</h4>
                            </div>
                            <div class="summary-grid">
                                <div class="summary-item">
                                    <span class="summary-label">학급</span>
                                    <span class="summary-value">${student.grade}학년 ${student.class}반 ${student.originalNumber}번</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">출처</span>
                                    <span class="summary-value">${student.fileName}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">평균등급</span>
                                    <span class="summary-value highlight">${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">평균 백분위</span>
                                    <span class="summary-value highlight">${weightedAveragePercentile ? weightedAveragePercentile.toFixed(1) + '%' : 'N/A'}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">전체 학생수</span>
                                    <span class="summary-value">${student.totalStudents || 'N/A'}명</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        <h4>과목별 백분위(등급)</h4>
                        <canvas id="studentPercentileChart" width="400" height="400"></canvas>
                    </div>
                </div>
                
                <div class="subject-details">
                    <h4>과목별 상세 분석</h4>
                    <div class="subject-cards">
                        ${this.renderSubjectCards(student)}
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // 레이더 차트 생성
        setTimeout(() => {
            this.createStudentPercentileChart(student);
        }, 100);
    }

    renderSubjectCards(student) {
        return this.combinedData.subjects.map(subject => {
            const score = student.scores[subject.name] || 0;
            const achievement = student.achievements[subject.name] || 'N/A';
            const grade = student.grades[subject.name];
            const rank = student.ranks[subject.name] || 'N/A';
            const percentile = student.percentiles[subject.name] || 0;
            
            // 등급이 있는지 확인
            const hasGrade = grade !== undefined && grade !== null && grade !== 'N/A' && !isNaN(grade);
            
            // 백분위에 따른 색상 결정 (등급이 있는 경우만)
            let percentileClass = 'low';
            if (hasGrade && percentile >= 80) percentileClass = 'excellent';
            else if (hasGrade && percentile >= 60) percentileClass = 'good';
            else if (hasGrade && percentile >= 40) percentileClass = 'average';
            
            if (hasGrade) {
                // 등급이 있는 과목: 모든 정보 표시
                return `
                    <div class="subject-card">
                        <div class="subject-header">
                            <h5>${subject.name}</h5>
                            <span class="credits">${subject.credits}학점</span>
                        </div>
                        <div class="subject-metrics">
                            <div class="metric">
                                <span class="metric-label">점수</span>
                                <span class="metric-value">${score}점</span>
                                <span class="metric-average">(평균: ${subject.average ? subject.average.toFixed(1) : 'N/A'}점)</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">성취도</span>
                                <span class="metric-value achievement ${achievement}">${achievement}</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">등급</span>
                                <span class="metric-value">${grade}등급</span>
                            </div>
                        </div>
                        <div class="subject-metrics">
                            <div class="metric">
                                <span class="metric-label">석차</span>
                                <span class="metric-value">${rank}위</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">백분위</span>
                                <span class="metric-value percentile ${percentileClass}">${percentile}%</span>
                            </div>
                            <div class="metric">
                            </div>
                        </div>
                        <div class="percentile-bar">
                            <div class="percentile-fill ${percentileClass}" style="width: ${percentile}%"></div>
                        </div>
                    </div>
                `;
            } else {
                // 등급이 없는 과목: 점수, 평균, 성취도만 표시
                return `
                    <div class="subject-card no-grade">
                        <div class="subject-header">
                            <h5>${subject.name}</h5>
                            <span class="credits">${subject.credits}학점</span>
                        </div>
                        <div class="subject-metrics simple">
                            <div class="metric">
                                <span class="metric-label">점수</span>
                                <span class="metric-value">${score}점</span>
                                <span class="metric-average">(평균: ${subject.average ? subject.average.toFixed(1) : 'N/A'}점)</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">성취도</span>
                                <span class="metric-value achievement ${achievement}">${achievement}</span>
                            </div>
                        </div>
                        <div class="no-grade-notice">
                            <span>등급 산출 대상 과목이 아닙니다</span>
                        </div>
                    </div>
                `;
            }
        }).join('');
    }

    createStudentPercentileChart(student) {
        const ctx = document.getElementById('studentPercentileChart');
        if (!ctx) return;
        
        // 기존 차트 제거
        if (this.studentPercentileChart) {
            this.studentPercentileChart.destroy();
        }

        // 등급이 있는 과목만 필터링
        const subjects = this.combinedData.subjects.filter(subject => {
            const grade = student.grades[subject.name];
            return grade !== undefined && grade !== null && grade !== 'N/A' && !isNaN(grade);
        });

        if (subjects.length === 0) {
            ctx.parentElement.style.display = 'none';
            return;
        }

        ctx.parentElement.style.display = 'block';
        const labels = subjects.map(subject => subject.name);
        const percentileData = subjects.map(subject => {
            return student.percentiles[subject.name] || 0; // 이미 백분위로 계산됨
        });
        
        this.studentPercentileChart = new Chart(ctx, {
            type: 'radar',
            plugins: [ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label: '백분위',
                    data: percentileData,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(52, 152, 219, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: {
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        callbacks: {
                            label: function(context) {
                                const subjectName = context.label;
                                const percentile = context.parsed.r;
                                // 해당 과목의 등급 찾기
                                const subjectIndex = labels.indexOf(subjectName);
                                const grade = subjects[subjectIndex] ? student.grades[subjects[subjectIndex].name] : 'N/A';
                                return `${percentile}% (${grade}등급)`;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        color: '#2c3e50',
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        borderColor: '#dee2e6',
                        borderWidth: 1,
                        borderRadius: 4,
                        padding: {
                            top: 4,
                            bottom: 4,
                            left: 6,
                            right: 6
                        },
                        font: {
                            size: 11,
                            weight: 'bold'
                        },
                        formatter: function(value, context) {
                            const subjectIndex = context.dataIndex;
                            const grade = subjects[subjectIndex] ? student.grades[subjects[subjectIndex].name] : 'N/A';
                            return `${Math.round(value)}%\n(${grade}등급)`;
                        },
                        anchor: 'end',
                        align: 'top',
                        offset: 10,
                        textAlign: 'center'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            font: {
                                size: 12
                            },
                            color: '#5a6c7d'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        pointLabels: {
                            font: {
                                size: 12,
                                weight: '500'
                            },
                            color: '#2c3e50'
                        }
                    }
                }
            }
        });
    }


    showLoading() {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        this.hideError();
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    hideError() {
        document.getElementById('error').style.display = 'none';
    }
}

// 페이지 로드 시 분석기 초기화
document.addEventListener('DOMContentLoaded', () => {
    new ScoreAnalyzer();
});