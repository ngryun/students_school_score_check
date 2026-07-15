class ScoreAnalyzer {
    constructor() {
        this.filesData = new Map(); // 파일명 -> 분석 데이터 매핑
        this.combinedData = null; // 통합된 분석 데이터
        this.selectedFiles = null; // 사용자가 선택/드롭한 파일 목록
        this.subjectGroups = null; // 교과(군) 매핑 데이터
        this.subjectGroupsReady = this.loadSubjectGroups(); // 교과(군) 데이터 로드
        this.handleStudentDetailKeydown = this.handleStudentDetailKeydown.bind(this);
        this._sortColumn = null; // 학생 테이블 정렬 기준
        this._sortAsc = true; // 정렬 방향
        this._showRankings = true; // 순위 표시 여부
        this.initializeEventListeners();

        // If the page provides preloaded analysis data, render directly
        if (window.PRELOADED_DATA) {
            this.initializePreloadedView();
        }
    }

    async initializePreloadedView() {
        try {
            await this.subjectGroupsReady;
            if (window.PRELOADED_UI_STATE && Object.prototype.hasOwnProperty.call(window.PRELOADED_UI_STATE, 'showRankings')) {
                this._showRankings = window.PRELOADED_UI_STATE.showRankings !== false;
            }
            this.combinedData = window.PRELOADED_DATA;
            this.setIntroSectionVisible(false);
            const results = document.getElementById('results');
            if (results) results.style.display = 'block';
            this.displayResults();
            this.applyPreloadedUiState();
            const exportCsvBtn = document.getElementById('exportCsvBtn');
            const exportHtmlBtn = document.getElementById('exportHtmlBtn');
            if (exportCsvBtn) exportCsvBtn.disabled = false;
            if (exportHtmlBtn) exportHtmlBtn.disabled = false;
        } catch (e) {
            console.error('PRELOADED_DATA 처리 중 오류:', e);
        }
    }

    setIntroSectionVisible(visible) {
        const container = document.querySelector('.container');
        if (!container) return;
        container.classList.toggle('post-analysis', !visible);
    }

    getCurrentUiState() {
        const activeTabBtn = document.querySelector('.tab-btn.active');
        const detailViewBtn = document.getElementById('detailViewBtn');

        return {
            activeTab: activeTabBtn ? activeTabBtn.dataset.tab : 'grade-analysis',
            activeView: detailViewBtn && detailViewBtn.classList.contains('active') ? 'detail' : 'table',
            selectedGrade: document.getElementById('gradeSelect')?.value || '',
            selectedClass: document.getElementById('classSelect')?.value || '',
            selectedStudent: document.getElementById('studentSelect')?.value || '',
            studentNameSearch: document.getElementById('studentNameSearch')?.value || '',
            showRankings: this._showRankings
        };
    }

    applyRankVisibilityState() {
        const rankVisibilityToggle = document.getElementById('rankVisibilityToggle');
        if (rankVisibilityToggle) {
            rankVisibilityToggle.checked = this._showRankings;
        }

        const results = document.getElementById('results');
        if (results) {
            results.classList.toggle('rankings-hidden', !this._showRankings);
            results.dataset.showRankings = this._showRankings ? 'true' : 'false';
        }

        document.querySelectorAll('.print-area, .student-print-page').forEach((element) => {
            element.classList.toggle('rankings-hidden', !this._showRankings);
        });
    }

    setRankVisibility(visible) {
        const nextValue = visible !== false;
        const didChange = this._showRankings !== nextValue;
        this._showRankings = nextValue;

        if (!this._showRankings && this._sortColumn === 'rank') {
            this._sortColumn = null;
            this._sortAsc = true;
        }

        this.applyRankVisibilityState();

        if (didChange && this.combinedData) {
            this.filterStudentTable();
        }
    }

    getRadarLabelPlacement(index, totalPoints, pointValue) {
        const safeTotal = Math.max(totalPoints || 1, 1);
        const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / safeTotal);
        const outwardAngle = ((angle * 180) / Math.PI + 360) % 360;
        const inwardAngle = (((angle + Math.PI) * 180) / Math.PI + 360) % 360;
        const isNearVertical = Math.abs(Math.cos(angle)) < 0.3;

        if (pointValue >= 4.4) {
            return {
                align: inwardAngle,
                offset: isNearVertical ? 16 : 18
            };
        }

        if (pointValue >= 3.6) {
            return {
                align: inwardAngle,
                offset: isNearVertical ? 10 : 12
            };
        }

        return {
            align: outwardAngle,
            offset: isNearVertical ? 10 : 12
        };
    }

    applyPreloadedUiState() {
        const state = window.PRELOADED_UI_STATE;
        if (!state || !this.combinedData) return;

        if (Object.prototype.hasOwnProperty.call(state, 'showRankings')) {
            this._showRankings = state.showRankings !== false;
        }
        this.applyRankVisibilityState();

        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentSelect = document.getElementById('studentSelect');
        const studentNameSearch = document.getElementById('studentNameSearch');
        const showStudentDetail = document.getElementById('showStudentDetail');

        if (gradeSelect) gradeSelect.value = state.selectedGrade || '';
        this.updateClassOptions();

        if (classSelect) classSelect.value = state.selectedClass || '';
        if (studentNameSearch) studentNameSearch.value = state.studentNameSearch || '';
        this.updateStudentOptions();

        if (studentSelect && state.selectedStudent) {
            studentSelect.value = String(state.selectedStudent);
        }
        if (showStudentDetail && studentSelect) {
            showStudentDetail.disabled = !studentSelect.value;
        }

        this.filterStudentTable();

        if (state.activeTab && document.querySelector(`[data-tab="${state.activeTab}"]`)) {
            this.switchTab(state.activeTab);
        }

        if (state.activeView === 'detail' && studentSelect && studentSelect.value) {
            const targetStudent = this.combinedData.students.find(
                student => String(student.number) === String(studentSelect.value)
            );
            if (targetStudent) {
                this.renderStudentDetail(targetStudent);
                this.switchView('detail');
            }
        } else if (state.activeView === 'table') {
            this.switchView('table');
        }
    }

    // 교과(군) 매핑 데이터 로드
    async loadSubjectGroups() {
        if (window.PRELOADED_SUBJECT_GROUPS) {
            this.subjectGroups = window.PRELOADED_SUBJECT_GROUPS;
            return this.subjectGroups;
        }

        try {
            const response = await fetch('subjectGroups.json');
            if (response.ok) {
                this.subjectGroups = await response.json();
                console.log('교과(군) 매핑 데이터 로드 완료');
            } else {
                console.warn('subjectGroups.json 파일을 찾을 수 없습니다. 기본 매핑을 사용합니다.');
                this.setDefaultSubjectGroups();
            }
        } catch (error) {
            console.warn('교과(군) 매핑 데이터 로드 실패:', error);
            this.setDefaultSubjectGroups();
        }

        return this.subjectGroups;
    }

    // 기본 교과(군) 매핑 설정 (JSON 로드 실패 시)
    setDefaultSubjectGroups() {
        this.subjectGroups = {
            groups: {
                "국어": { keywords: ["국어", "화법", "독서", "문학", "언어", "작문", "매체", "직무 의사소통"], color: "#e74c3c", order: 1 },
                "수학": { keywords: ["수학", "대수", "미적분", "확률", "통계", "기하"], color: "#3498db", order: 2 },
                "영어": { keywords: ["영어", "English", "영미 문학"], color: "#2ecc71", order: 3 },
                "사회": { keywords: ["사회", "역사", "지리", "윤리", "정치", "경제", "법", "세계사", "동아시아", "시민", "도시의 미래", "국제 관계", "금융", "지속가능한 세계"], color: "#f39c12", order: 4 },
                "과학": { keywords: ["과학", "물리", "화학", "생명", "지구", "탐구실험", "생물", "역학", "전자기", "양자", "물질과 에너지", "세포와 물질대사", "환경생태", "융합과학"], color: "#9b59b6", order: 5 },
                "체육": { keywords: ["체육", "운동과 건강", "스포츠"], color: "#1abc9c", order: 6 },
                "예술": { keywords: ["음악", "미술", "연극"], color: "#e67e22", order: 7 },
                "기술·가정/정보": { keywords: ["기술", "가정", "정보", "로봇", "공학", "생활과학", "지식 재산", "생애 설계", "아동발달", "인공지능 기초", "데이터 과학", "소프트웨어"], color: "#34495e", order: 8 },
                "제2외국어/한문": { keywords: ["제2외국어", "독일어", "프랑스어", "스페인어", "중국어", "일본어", "러시아어", "아랍어", "베트남어", "중국 문화", "일본 문화", "러시아 문화", "아랍 문화", "베트남 문화", "한문", "한자"], color: "#16a085", order: 9 },
                "교양": { keywords: ["진로와 직업", "생태와 환경", "인간과 철학", "논리와 사고", "인간과 심리", "교육의 이해", "삶과 종교", "보건", "인간과 경제활동", "논술"], color: "#8e6e53", order: 10 },
                "기타": { keywords: [], color: "#95a5a6", order: 11 }
            },
            priorityKeywords: {
                "영어": ["영어", "English", "영미 문학"],
                "사회": ["인문학과 윤리"],
                "과학": ["과학의 역사와 문화"],
                "체육": ["스포츠 과학"],
                "예술": ["미술과 매체"],
                "기술·가정/정보": ["생활과학 탐구", "데이터 과학"],
                "제2외국어/한문": ["독일어", "프랑스어", "스페인어", "중국어", "일본어", "러시아어", "아랍어", "베트남어", "언어생활과 한자"],
                "교양": ["인간과 경제활동"]
            },
            exactMatch: {
                "한국사1": "사회", "한국사2": "사회",
                "통합사회1": "사회", "통합사회2": "사회",
                "통합과학1": "과학", "통합과학2": "과학",
                "과학탐구실험1": "과학", "과학탐구실험2": "과학",
                "정보": "기술·가정/정보", "기술가정": "기술·가정/정보",
                "음악": "예술", "미술": "예술", "체육": "체육",
                "보건": "교양", "진로와직업": "교양",
                "제2외국어": "제2외국어/한문", "한문": "제2외국어/한문"
            }
        };
    }

    // 원본 양식의 교과(군) 값을 프로그램의 표준 교과군 이름으로 정규화
    normalizeSourceSubjectGroup(sourceGroup) {
        const normalized = String(sourceGroup || '')
            .normalize('NFKC')
            .replace(/\s+/g, '')
            .replace(/[()\/·ㆍ⋅]/g, '');

        if (!normalized) return '';

        const aliases = {
            '국어': "국어",
            '국어과': "국어",
            '수학': "수학",
            '수학과': "수학",
            '영어': "영어",
            '영어과': "영어",
            '사회': "사회",
            '사회역사도덕포함': "사회",
            '역사': "사회",
            '도덕': "사회",
            '한국사': "사회",
            '과학': "과학",
            '과학과': "과학",
            '체육': "체육",
            '체육과': "체육",
            '예술': "예술",
            '예술음악미술': "예술",
            '음악': "예술",
            '미술': "예술",
            '기술가정정보': "기술·가정/정보",
            '기술가정': "기술·가정/정보",
            '정보': "기술·가정/정보",
            '제2외국어한문': "제2외국어/한문",
            '제2외국어': "제2외국어/한문",
            '한문': "제2외국어/한문",
            '교양': "교양"
        };

        const matchedGroup = aliases[normalized] || '';
        if (!matchedGroup || !this.subjectGroups?.groups?.[matchedGroup]) return '';
        return matchedGroup;
    }

    // 원본 교과(군)을 우선 사용하고, 없으면 과목명으로 교과(군)을 매핑
    getSubjectGroup(subjectName, sourceGroup = '') {
        if (!this.subjectGroups) {
            return "기타";
        }

        const normalizedSourceGroup = this.normalizeSourceSubjectGroup(sourceGroup);
        if (normalizedSourceGroup) {
            return normalizedSourceGroup;
        }

        // 1. 정확히 일치하는 항목 먼저 확인
        if (this.subjectGroups.exactMatch && this.subjectGroups.exactMatch[subjectName]) {
            return this.subjectGroups.exactMatch[subjectName];
        }

        // 2. 부분 문자열 충돌 가능성이 있는 과목을 우선 매핑
        if (this.subjectGroups.priorityKeywords) {
            for (const [groupName, keywords] of Object.entries(this.subjectGroups.priorityKeywords)) {
                if (keywords.some(keyword => subjectName.includes(keyword))) {
                    return groupName;
                }
            }
        }

        // 3. 키워드 기반 매핑
        for (const [groupName, groupData] of Object.entries(this.subjectGroups.groups)) {
            if (groupName === "기타") continue; // 기타는 마지막에 처리
            for (const keyword of groupData.keywords) {
                if (subjectName.includes(keyword)) {
                    return groupName;
                }
            }
        }

        // 4. 매칭되지 않으면 기타
        return "기타";
    }

    getSubjectColumnLabel(subject) {
        if (!subject || !subject.name) return '';
        return `${this.getSubjectGroup(subject.name, subject.sourceGroup)}_${subject.name}`;
    }

    // 학생의 교과(군)별 평균 등급 계산
    calculateGroupGrades(student) {
        const groupData = {};

        // 교과군별로 데이터 초기화
        if (this.subjectGroups && this.subjectGroups.groups) {
            for (const groupName of Object.keys(this.subjectGroups.groups)) {
                groupData[groupName] = {
                    totalGradePoints: 0,
                    totalCredits: 0,
                    subjects: []
                };
            }
        }

        // 각 과목을 교과군에 할당
        this.combinedData.subjects.forEach(subject => {
            const grade = student.grades[subject.name];
            if (grade !== undefined && grade !== null && !isNaN(grade)) {
                const groupName = this.getSubjectGroup(subject.name, subject.sourceGroup);
                if (!groupData[groupName]) {
                    groupData[groupName] = { totalGradePoints: 0, totalCredits: 0, subjects: [] };
                }
                groupData[groupName].totalGradePoints += grade * subject.credits;
                groupData[groupName].totalCredits += subject.credits;
                groupData[groupName].subjects.push({
                    name: subject.name,
                    grade: grade,
                    credits: subject.credits
                });
            }
        });

        // 교과군별 평균 등급 계산
        const result = {};
        for (const [groupName, data] of Object.entries(groupData)) {
            if (data.totalCredits > 0) {
                result[groupName] = {
                    averageGrade: data.totalGradePoints / data.totalCredits,
                    totalCredits: data.totalCredits,
                    subjects: data.subjects,
                    color: this.subjectGroups?.groups?.[groupName]?.color || "#95a5a6",
                    order: this.subjectGroups?.groups?.[groupName]?.order || 99
                };
            }
        }

        return result;
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('excelFiles');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const exportHtmlBtn = document.getElementById('exportHtmlBtn');
        const rankVisibilityToggle = document.getElementById('rankVisibilityToggle');
        const tabBtns = document.querySelectorAll('.tab-btn');
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentSelect = document.getElementById('studentSelect');
        const studentNameSearch = document.getElementById('studentNameSearch');
        const showStudentDetail = document.getElementById('showStudentDetail');
        const tableViewBtn = document.getElementById('tableViewBtn');
        const detailViewBtn = document.getElementById('detailViewBtn');
        const pdfClassBtn = document.getElementById('pdfClassBtn');
        const uploadSection = document.querySelector('.upload-section');
        const fileLabel = document.querySelector('.file-input-label');

        document.addEventListener('keydown', this.handleStudentDetailKeydown);

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                this.selectedFiles = files;
                this.displayFileList(files);
                analyzeBtn.disabled = false;
                this.hideError();
            }
        });

        // Drag & drop 지원 (업로드 섹션 전체)
        if (uploadSection) {
            const prevent = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
            };
            const setDragState = (on) => {
                if (fileLabel) fileLabel.classList.toggle('dragover', on);
                uploadSection.classList.toggle('dragover', on);
            };

            // 전역 기본 동작 방지: 페이지로 파일이 열리는 것을 방지
            ['dragover', 'drop'].forEach(evt => {
                window.addEventListener(evt, (ev) => {
                    prevent(ev);
                });
            });

            ['dragenter', 'dragover'].forEach(evt => {
                uploadSection.addEventListener(evt, (ev) => {
                    prevent(ev);
                    setDragState(true);
                });
            });
            ['dragleave', 'dragend'].forEach(evt => {
                uploadSection.addEventListener(evt, (ev) => {
                    prevent(ev);
                    setDragState(false);
                });
            });
            uploadSection.addEventListener('drop', (ev) => {
                prevent(ev);
                setDragState(false);
                const dropped = Array.from(ev.dataTransfer?.files || []);
                const files = dropped.filter(f => /\.(xlsx|xls)$/i.test(f.name));
                if (files.length === 0) {
                    this.showError('XLS/XLSX 파일을 드래그하여 업로드하세요.');
                    return;
                }
                this.selectedFiles = files;
                this.displayFileList(files);
                analyzeBtn.disabled = false;
                this.hideError();
                try { if (fileInput) fileInput.files = ev.dataTransfer.files; } catch (_) {}
            });
        }

        if (analyzeBtn) analyzeBtn.addEventListener('click', () => { this.analyzeFiles(); });

        if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => { this.exportToCSV(); });

        if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', () => { this.showHtmlExportOptionsModal(); });

        if (rankVisibilityToggle) {
            rankVisibilityToggle.addEventListener('change', (event) => {
                this.setRankVisibility(event.target.checked);
            });
        }

        if (tabBtns && tabBtns.length) {
            tabBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.switchTab(e.target.dataset.tab);
                });
            });
        }

        gradeSelect.addEventListener('change', () => {
            this.updateClassOptions();
            this.updateStudentOptions();
            this.filterStudentTable();
        });

        classSelect.addEventListener('change', () => {
            this.updateStudentOptions();
            this.filterStudentTable();
        });

        studentSelect.addEventListener('change', () => {
            showStudentDetail.disabled = !studentSelect.value;
            // Auto-show student detail on select
            if (studentSelect.value) {
                this.showStudentDetail();
            }
        });
        if (studentNameSearch) {
            studentNameSearch.addEventListener('input', () => {
                this.updateStudentOptions();
                this.filterStudentTable();
            });
        }

        showStudentDetail.addEventListener('click', () => {
            this.showStudentDetail();
        });

        tableViewBtn.addEventListener('click', () => {
            this.switchView('table');
        });

        detailViewBtn.addEventListener('click', () => {
            this.switchView('detail');
        });

        if (pdfClassBtn) {
            pdfClassBtn.addEventListener('click', () => this.generateSelectedClassPDF());
        }

        // In-app help button
        const helpBtn = document.getElementById('inAppHelpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showHelpModal());
        }

        // Restore tab from URL hash
        window.addEventListener('hashchange', () => {
            const hash = location.hash.replace('#', '');
            if (hash && document.querySelector(`[data-tab="${hash}"]`)) {
                this.switchTab(hash);
            }
        });

        // Mobile filter toggle
        this._setupMobileFilterToggle();
        this.applyRankVisibilityState();
    }

    _setupMobileFilterToggle() {
        const selector = document.querySelector('.student-selector');
        if (!selector) return;

        // Add toggle button if not present
        if (!selector.querySelector('.filter-toggle-btn')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'detail-btn filter-toggle-btn';
            toggleBtn.innerHTML = '\u25BC \uD544\uD130 \uD3BC\uCE58\uAE30';
            toggleBtn.addEventListener('click', () => {
                const collapsed = selector.classList.toggle('collapsed');
                toggleBtn.innerHTML = collapsed ? '\u25BC \uD544\uD130 \uD3BC\uCE58\uAE30' : '\u25B2 \uD544\uD130 \uC811\uAE30';
            });
            selector.insertBefore(toggleBtn, selector.firstChild);
            // Start collapsed on mobile
            if (window.innerWidth <= 768) {
                selector.classList.add('collapsed');
            }
        }
    }

    handleStudentDetailKeydown(event) {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
        }

        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return;
        }

        const target = event.target;
        const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
        if (
            (target && target.isContentEditable) ||
            tagName === 'input' ||
            tagName === 'textarea' ||
            tagName === 'select'
        ) {
            return;
        }

        const studentsTab = document.getElementById('students-tab');
        const detailViewBtn = document.getElementById('detailViewBtn');
        const detailView = document.getElementById('detailView');
        const studentSelect = document.getElementById('studentSelect');

        const isStudentsTabActive = !!studentsTab && studentsTab.classList.contains('active');
        const isDetailViewActive = !!detailViewBtn && detailViewBtn.classList.contains('active');
        const isDetailViewVisible = !!detailView && detailView.style.display !== 'none';

        if (!isStudentsTabActive || !isDetailViewActive || !isDetailViewVisible || !studentSelect || !studentSelect.value) {
            return;
        }

        event.preventDefault();
        this.navigateStudentDetail(event.key === 'ArrowLeft' ? -1 : 1);
    }

    displayFileList(files) {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<h4>선택된 파일:</h4>';

        const ul = document.createElement('ul');
        files.forEach((file, index) => {
            const li = document.createElement('li');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = file.name;
            li.appendChild(nameSpan);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'file-remove-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = '파일 제거';
            removeBtn.addEventListener('click', () => {
                this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
                if (this.selectedFiles.length === 0) {
                    fileList.style.display = 'none';
                    document.getElementById('analyzeBtn').disabled = true;
                } else {
                    this.displayFileList(this.selectedFiles);
                }
            });
            li.appendChild(removeBtn);
            ul.appendChild(li);
        });

        fileList.appendChild(ul);
        fileList.style.display = 'block';
    }

    async analyzeFiles() {
        const fileInput = document.getElementById('excelFiles');
        const files = (this.selectedFiles && this.selectedFiles.length > 0)
            ? this.selectedFiles
            : Array.from(fileInput.files);

        if (files.length === 0) {
            this.showError('파일을 선택해주세요.');
            return;
        }

        this.showLoading();

        try {
            await this.subjectGroupsReady;
            this.filesData.clear();

            const totalFiles = files.length;
            for (let i = 0; i < files.length; i++) {
                this.updateLoadingProgress(i, totalFiles, files[i].name);
                const data = await this.readExcelFile(files[i]);
                const fileData = this.parseFileData(data, files[i].name);
                this.filesData.set(files[i].name, fileData);
            }
            this.updateLoadingProgress(totalFiles, totalFiles, '통합 분석 중...');

            this.combineAllData();
            this.displayResults();
            this.setIntroSectionVisible(false);
            this.hideLoading();

            // Enable export buttons after successful analysis
            const exportCsvBtn = document.getElementById('exportCsvBtn');
            const exportHtmlBtn = document.getElementById('exportHtmlBtn');
            if (exportCsvBtn) exportCsvBtn.disabled = false;
            if (exportHtmlBtn) exportHtmlBtn.disabled = false;

            // Show analysis summary banner
            this.showAnalysisSummary();

            // Auto-scroll to results
            const results = document.getElementById('results');
            if (results) {
                results.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

        } catch (error) {
            this.hideLoading();
            this.showError('파일 분석 중 오류가 발생했습니다: ' + error.message);
        }
    }

    updateLoadingProgress(current, total, label) {
        const bar = document.getElementById('loadingProgressBar');
        const text = document.getElementById('loadingProgressText');
        const loadingText = document.getElementById('loadingText');
        const pct = Math.round((current / Math.max(1, total)) * 100);
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = `${current}/${total} 파일 처리됨`;
        if (loadingText && label) loadingText.textContent = label;
    }

    showAnalysisSummary() {
        const banner = document.getElementById('analysisSummaryBanner');
        if (!banner || !this.combinedData) return;

        const studentCount = this.combinedData.students.length;
        const subjectCount = this.combinedData.subjects.length;
        const fileCount = this.combinedData.fileNames ? this.combinedData.fileNames.length : 0;

        banner.innerHTML = `
            <div class="analysis-summary-banner">
                <span class="summary-icon">\u2705</span>
                <div>
                    <div class="summary-text">분석 완료</div>
                    <div class="summary-detail">${fileCount}개 파일 \u00B7 ${studentCount}명 학생 \u00B7 ${subjectCount}개 과목</div>
                </div>
            </div>
        `;
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
                        sourceGroup: subject.sourceGroup || '',
                        averages: [],
                        distributions: [],
                        columnIndex: subject.columnIndex
                    });
                }
                const combinedSubject = subjectMap.get(key);
                if (subject.sourceGroup && (
                    !combinedSubject.sourceGroup ||
                    (!this.normalizeSourceSubjectGroup(combinedSubject.sourceGroup) &&
                        this.normalizeSourceSubjectGroup(subject.sourceGroup))
                )) {
                    combinedSubject.sourceGroup = subject.sourceGroup;
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

        // 모든 학생 데이터 통합 (같은 학년-반-번호 학생은 병합)
        const studentMap = new Map();

        this.filesData.forEach((fileData, fileName) => {
            fileData.students.forEach(student => {
                // 학생 고유 키: 학년-반-번호 (같은 학생 식별)
                const studentKey = `${fileData.grade}-${fileData.class}-${student.number}`;

                if (!studentMap.has(studentKey)) {
                    // 새로운 학생 생성
                    studentMap.set(studentKey, {
                        originalNumber: student.number,
                        originalName: student.name,
                        name: student.name,
                        displayName: `${fileData.grade}학년${fileData.class}반-${student.name}`,
                        grade: fileData.grade,
                        class: fileData.class,
                        fileNames: [fileName],
                        scores: {},
                        achievements: {},
                        grades: {},
                        ranks: {},
                        subjectTotals: {},
                        percentiles: {},
                        totalStudents: student.totalStudents,
                        hasGradeReportSource: fileData.format === 'grade-report',
                        hasXlsDataSource: fileData.format !== 'grade-report'
                    });
                } else {
                    // 기존 학생에 파일명 추가
                    studentMap.get(studentKey).fileNames.push(fileName);
                }

                const combinedStudent = studentMap.get(studentKey);
                combinedStudent.hasGradeReportSource = combinedStudent.hasGradeReportSource || fileData.format === 'grade-report';
                combinedStudent.hasXlsDataSource = combinedStudent.hasXlsDataSource || fileData.format !== 'grade-report';

                // 과목별 데이터 병합 (각 파일의 과목 데이터를 추가)
                Object.keys(student.scores || {}).forEach(subjectName => {
                    combinedStudent.scores[subjectName] = student.scores[subjectName];
                });
                Object.keys(student.achievements || {}).forEach(subjectName => {
                    combinedStudent.achievements[subjectName] = student.achievements[subjectName];
                });
                Object.keys(student.grades || {}).forEach(subjectName => {
                    combinedStudent.grades[subjectName] = student.grades[subjectName];
                });
                Object.keys(student.ranks || {}).forEach(subjectName => {
                    combinedStudent.ranks[subjectName] = student.ranks[subjectName];
                });
                Object.keys(student.subjectTotals || {}).forEach(subjectName => {
                    combinedStudent.subjectTotals[subjectName] = student.subjectTotals[subjectName];
                });

                // 수강자수 업데이트 (최대값 사용)
                if (student.totalStudents && (!combinedStudent.totalStudents || student.totalStudents > combinedStudent.totalStudents)) {
                    combinedStudent.totalStudents = student.totalStudents;
                }
            });
        });

        // Map을 배열로 변환하고 번호 할당
        let studentCounter = 1;
        studentMap.forEach((student, key) => {
            student.number = studentCounter++;
            // 병합 후 가중평균등급 재계산
            student.weightedAverageGrade = this.calculateWeightedAverageGrade(student, this.combinedData.subjects);
            this.combinedData.students.push(student);
        });

        // 과목별 백분위 계산
        this.calculatePercentiles();

        // 평균등급 기준 순위 계산
        this.calculateAverageGradeRanks();
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

            // 기본 분모: 실제 집계된 석차 보유자 수
            const totalStudents = studentsWithRanks.length;

            // 각 학생의 백분위 계산
            studentsWithRanks.forEach((item, index) => {
                const studentRank = item.rank;
                
                // 같은 석차의 학생들 찾기
                const sameRankStudents = studentsWithRanks.filter(s => s.rank === studentRank);
                const sameRankCount = sameRankStudents.length;
                
                // 해당 석차보다 나쁜 석차의 학생 수 (석차가 높은 학생들)
                const worseRankCount = studentsWithRanks.filter(s => s.rank > studentRank).length;
                
                // 분모 선택: 과목별 수강자수(subjectTotals)가 있으면 그 값을 우선 사용
                const subjTotal = item.student.subjectTotals && item.student.subjectTotals[subject.name]
                    ? item.student.subjectTotals[subject.name]
                    : totalStudents;
                // 백분위 계산(동점 보정): (전체 - 석차 + 0.5) / 전체 * 100
                const raw = ((subjTotal - studentRank + 0.5) / Math.max(1, subjTotal)) * 100;
                const percentile = raw;
                
                // 0~100 범위로 제한하고 내림 처리하여 경계 상향 편향 방지
                const finalPercentile = Math.max(0, Math.min(100, Math.floor(percentile)));
                
                item.student.percentiles[subject.name] = finalPercentile;
            });
        });
    }

    calculateAverageGradeRanks() {
        if (!this.combinedData) return;

        // 평균등급이 있는 학생들만 필터링하고 정렬
        const studentsWithGrades = this.combinedData.students
            .filter(student => student.weightedAverageGrade !== null && student.weightedAverageGrade !== undefined)
            .sort((a, b) => a.weightedAverageGrade - b.weightedAverageGrade);

        if (studentsWithGrades.length === 0) return;

        let currentRank = 1;
        let previousGrade = null;
        let sameGradeCount = 0;

        studentsWithGrades.forEach((student, index) => {
            const studentGrade = student.weightedAverageGrade;
            
            // 이전 학생과 평균등급이 다르면 순위 업데이트
            if (previousGrade !== null && Math.abs(studentGrade - previousGrade) >= 0.01) {
                currentRank = index + 1;
                sameGradeCount = 1;
            } else if (previousGrade !== null) {
                // 같은 등급
                sameGradeCount++;
            } else {
                // 첫 번째 학생
                sameGradeCount = 1;
            }
            
            // 같은 평균등급의 학생 수 계산
            const totalSameGrade = studentsWithGrades.filter(s => 
                Math.abs(s.weightedAverageGrade - studentGrade) < 0.01
            ).length;
            
            student.averageGradeRank = currentRank;
            student.sameGradeCount = totalSameGrade;
            student.totalGradedStudents = studentsWithGrades.length;
            
            previousGrade = studentGrade;
        });

        // 평균등급이 없는 학생들은 순위도 null로 설정
        this.combinedData.students.forEach(student => {
            if (student.weightedAverageGrade === null || student.weightedAverageGrade === undefined) {
                student.averageGradeRank = null;
                student.sameGradeCount = null;
            }
            
            // 9등급 환산 평균 계산 (기존 데이터에 없는 경우)
            if (student.weightedAverage9Grade === null || student.weightedAverage9Grade === undefined) {
                student.weightedAverage9Grade = this.calculateWeightedAverage9Grade(student, this.combinedData.subjects);
            }
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
        const format = this.detectFileFormat(data);
        if (format === 'grade-report') {
            console.log(`[${fileName}] 인쇄용 성적표 양식 감지`);
            return this.parseGradeReport(data, fileName);
        }

        const fileData = {
            fileName: fileName,
            data: data,
            subjects: [],
            students: [],
            grade: 1,
            class: 1,
            format: 'xls-data'
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

    detectFileFormat(data) {
        if (!data || data.length < 5) return 'xls-data';

        const row4 = data[3];
        if (!row4 || row4.length < 4) return 'xls-data';

        const knownHeaders = [
            '번호', '성명', '학년', '학기', '교과',
            '과목명', '과목', '학점', '단위수',
            '석차등급', '수강자수', '성취도', '원점수'
        ];
        let matchCount = 0;

        for (let c = 0; c < Math.min(row4.length, 20); c++) {
            const cell = String(row4[c] || '').replace(/\s+/g, '').trim();
            if (knownHeaders.some(header => cell.includes(header))) {
                matchCount++;
            }
        }

        if (matchCount >= 4) return 'grade-report';

        for (let c = 3; c < row4.length; c++) {
            const cell = String(row4[c] || '').trim();
            if (/^.+\(\d+\)$/.test(cell)) {
                return 'xls-data';
            }
        }

        return 'xls-data';
    }

    parseGradeReport(data, fileName) {
        const fileData = {
            fileName: fileName,
            data: data,
            subjects: [],
            students: [],
            grade: 1,
            class: 1,
            format: 'grade-report'
        };

        if (data[2] && data[2][0]) {
            const info = String(data[2][0]);
            const gradeMatches = info.match(/(\d+)\s*학년/g);
            if (gradeMatches) {
                const lastMatch = gradeMatches[gradeMatches.length - 1];
                const gradeMatch = lastMatch.match(/(\d+)/);
                if (gradeMatch) {
                    const parsedGrade = parseInt(gradeMatch[1], 10);
                    if (parsedGrade < 10) fileData.grade = parsedGrade;
                }
            }

            const classMatch = info.match(/(\d+)\s*반/);
            if (classMatch) {
                fileData.class = parseInt(classMatch[1], 10);
            }

            console.log(`[인쇄용 양식] ${fileData.grade}학년 ${fileData.class}반 감지`);
        }

        const headerRow = data[3] || [];
        const colMap = this._buildGradeReportColumnMap(headerRow);
        console.log('[인쇄용 양식] 열 매핑:', JSON.stringify(colMap));

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

            if (cellA.includes('체육') && (cellA.includes('예술') || cellA.includes('과학탐구실험'))) {
                is예체능 = true;
                continue;
            }
            if (cellA.includes('진로') && cellA.includes('선택')) {
                is진로선택 = true;
                continue;
            }
            if (cellA.startsWith('<') && !cellA.includes('체육') && !cellA.includes('진로')) {
                // 섹션 구분선은 그대로 건너뛴다.
                continue;
            }

            if (this._isGradeReportHeaderRow(row, colMap)) continue;

            const subjectName = this._grVal(row, colMap, 'subjectName');
            const creditsRaw = this._grVal(row, colMap, 'credits');
            if (!subjectName || String(subjectName).trim() === '') continue;

            const credits = parseFloat(creditsRaw);
            if (isNaN(credits)) continue;

            const numVal = this._grVal(row, colMap, 'number');
            if (numVal !== undefined && numVal !== null && numVal !== '') {
                const parsedNumber = parseInt(numVal, 10);
                if (!isNaN(parsedNumber)) {
                    curNumber = parsedNumber;
                    const nameVal = this._grVal(row, colMap, 'name');
                    if (nameVal && String(nameVal).trim() !== '') {
                        curName = String(nameVal).trim();
                    }
                }
            }

            const yearVal = this._grVal(row, colMap, 'schoolYear');
            if (yearVal !== undefined && yearVal !== null && yearVal !== '') {
                const parsedYear = parseInt(yearVal, 10);
                if (!isNaN(parsedYear)) curSchoolYear = parsedYear;
            }

            const semVal = this._grVal(row, colMap, 'semester');
            if (semVal !== undefined && semVal !== null && semVal !== '') {
                const parsedSemester = parseInt(semVal, 10);
                if (!isNaN(parsedSemester)) curSemester = parsedSemester;
            }

            if (curNumber === null) continue;

            const subName = String(subjectName).trim();
            const subjectGroup = String(this._grVal(row, colMap, 'subjectGroup') || '').trim();

            let rawScore = null;
            let subjectAvg = 0;
            const rawScoreCell = this._grVal(row, colMap, 'rawScore');
            const avgCell = this._grVal(row, colMap, 'subjectAvg');

            if (rawScoreCell !== undefined && rawScoreCell !== null && rawScoreCell !== '') {
                const rawStr = String(rawScoreCell).trim();
                if (rawStr.includes('/')) {
                    const parts = rawStr.split('/');
                    const parsedRawScore = parseFloat(parts[0]);
                    rawScore = isNaN(parsedRawScore) ? null : parsedRawScore;
                    if (parts[1]) {
                        subjectAvg = parseFloat(parts[1].split('(')[0]) || 0;
                    }
                } else {
                    const parsedRawScore = parseFloat(rawStr);
                    rawScore = isNaN(parsedRawScore) ? null : parsedRawScore;
                }
            }

            if (avgCell !== undefined && avgCell !== null && avgCell !== '' && subjectAvg === 0) {
                subjectAvg = parseFloat(avgCell) || 0;
            }

            let achievement = '';
            if (is예체능 && colMap.achievement !== undefined) {
                const achVal = this._grVal(row, colMap, 'achievement');
                achievement = this._normalizeAchievementValue(achVal);
                if (!achievement && colMap.achievement > 0) {
                    achievement = this._normalizeAchievementValue(row[colMap.achievement - 1]);
                }
            } else {
                achievement = this._normalizeAchievementValue(this._grVal(row, colMap, 'achievement'));
            }

            let gradeRank = NaN;
            if (!is예체능) {
                const gradeRankRaw = this._grVal(row, colMap, 'gradeRank');
                if (gradeRankRaw !== undefined && gradeRankRaw !== null && gradeRankRaw !== '') {
                    const gradeMatch = String(gradeRankRaw).trim().match(/\d+/);
                    if (gradeMatch) gradeRank = parseInt(gradeMatch[0], 10);
                }
            }

            let totalStudents = NaN;
            if (!is예체능) {
                const totalRaw = this._grVal(row, colMap, 'totalStudents');
                if (totalRaw !== undefined && totalRaw !== null && totalRaw !== '') {
                    const totalMatch = String(totalRaw).trim().match(/\d+/);
                    if (totalMatch) totalStudents = parseInt(totalMatch[0], 10);
                }
            }

            const distRaw = this._grVal(row, colMap, 'achievementDist');

            if (!subjectMap.has(subName)) {
                subjectMap.set(subName, {
                    name: subName,
                    credits: credits,
                    averages: [],
                    rawDistributions: [],
                    group: subjectGroup,
                    isCareerTrack: is진로선택,
                    schoolYear: curSchoolYear,
                    semester: curSemester
                });
                subjectOrder.push(subName);
            }

            const subjectInfo = subjectMap.get(subName);
            if (!subjectInfo.group && subjectGroup) {
                subjectInfo.group = subjectGroup;
            }
            if (subjectAvg > 0) subjectInfo.averages.push(subjectAvg);
            if (distRaw && String(distRaw).trim() !== '') {
                subjectInfo.rawDistributions.push(String(distRaw).trim());
            }

            if (!studentMap.has(curNumber)) {
                studentMap.set(curNumber, {
                    number: curNumber,
                    name: curName || `학생${curNumber}`,
                    scores: {},
                    achievements: {},
                    grades: {},
                    ranks: {},
                    subjectTotals: {},
                    percentiles: {},
                    totalStudents: null,
                    sourceFormat: fileData.format,
                    hasGradeReportSource: true,
                    hasXlsDataSource: false
                });
            }

            const student = studentMap.get(curNumber);
            if (curName && curName !== `학생${curNumber}`) {
                student.name = curName;
            }

            if (rawScore !== null) {
                student.scores[subName] = rawScore;
            }
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

        subjectOrder.forEach((subName, idx) => {
            const info = subjectMap.get(subName);
            const subject = {
                name: info.name,
                credits: info.credits,
                sourceGroup: info.group || '',
                columnIndex: idx,
                average: info.averages.length > 0
                    ? info.averages.reduce((sum, value) => sum + value, 0) / info.averages.length
                    : 0,
                scores: []
            };

            if (info.rawDistributions.length > 0) {
                subject.distribution = this._parseAchievementDistString(info.rawDistributions[0]);
            }

            fileData.subjects.push(subject);
        });

        studentMap.forEach(student => {
            student.weightedAverageGrade = this.calculateWeightedAverageGrade(student, fileData.subjects);
            student.weightedAverage9Grade = this.calculateWeightedAverage9Grade(student, fileData.subjects);
            fileData.students.push(student);
        });

        console.log(`[인쇄용 양식] 과목 ${fileData.subjects.length}개, 학생 ${fileData.students.length}명 파싱 완료`);
        return fileData;
    }

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
            { keys: ['성취도별분포비율', '성취도별 분포비율', '분포비율'], field: 'achievementDist' }
        ];

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

        if (colMap.achievement === undefined) {
            for (let c = 0; c < headerRow.length; c++) {
                const raw = String(headerRow[c] || '').replace(/\s+/g, '').trim();
                if (raw.includes('성취도') && !raw.includes('분포') && !raw.includes('비율')) {
                    colMap.achievement = c;
                    break;
                }
            }
        }

        if (colMap.subjectAvg === undefined) {
            for (let c = 0; c < headerRow.length; c++) {
                const raw = String(headerRow[c] || '').replace(/\s+/g, '').trim();
                if (raw === '평균' && c !== colMap.rawScore) {
                    colMap.subjectAvg = c;
                    break;
                }
            }
        }

        if (colMap.rawScore === undefined && colMap.credits !== undefined) {
            colMap.rawScore = colMap.credits + 1;
        }

        return colMap;
    }

    _isGradeReportHeaderRow(row, colMap) {
        const cellA = String(row[0] || '').trim();
        if (cellA === '번호') return true;

        if (colMap.subjectName !== undefined) {
            const subjectName = String(row[colMap.subjectName] || '').trim();
            if (subjectName === '과목명' || subjectName === '과목') return true;
        }

        if (colMap.credits !== undefined) {
            const credits = String(row[colMap.credits] || '').trim();
            if (credits === '학점' || credits === '단위수') return true;
        }

        return false;
    }

    _grVal(row, colMap, field) {
        if (colMap[field] === undefined) return undefined;
        return row[colMap[field]];
    }

    _parseAchievementDistString(str) {
        const distribution = {};
        if (!str) return distribution;

        const matches = str.match(/[ABCDE]\s*\(\s*\d+\.?\d*\s*\)/g);
        if (matches) {
            matches.forEach(match => {
                const parsed = match.match(/([ABCDE])\s*\(\s*(\d+\.?\d*)\s*\)/);
                if (parsed) distribution[parsed[1]] = parseFloat(parsed[2]);
            });
        }

        return distribution;
    }

    _normalizeAchievementValue(value) {
        if (value === undefined || value === null) return '';

        const normalized = String(value).trim();
        if (!normalized || normalized.includes('전입')) return '';

        const match = normalized.match(/^[ABCDE]/);
        return match ? match[0] : '';
    }

    parseStudentData(data, fileData) {
        // 학생 데이터는 행 7부터 시작해서 각 학생마다 5행씩 사용
        // 행 7: 번호 + 합계(원점수)
        // 행 8: 성취도
        // 행 9: 석차등급  
        // 행 10: 석차
        // 행 11: 수강자수
        
        let consecutiveEmptyRows = 0;
        const maxConsecutiveEmpty = 15; // 연속으로 15행이 비어있으면 종료
        
        for (let i = 6; i < data.length; i += 5) { // 0-based로 행 7부터, 5행씩 건너뛰기
            const scoreRow = data[i];     // 합계(원점수) 행
            const achievementRow = data[i + 1]; // 성취도 행
            const gradeRow = data[i + 2];       // 석차등급 행
            const rankRow = data[i + 3];        // 석차 행
            const totalRow = data[i + 4];       // 수강자수 행
            
            // 학생 번호가 있는지 확인 (A열)
            if (!scoreRow || !scoreRow[0] || isNaN(scoreRow[0])) {
                consecutiveEmptyRows += 5; // 5행씩 건너뛰므로 5 증가
                if (consecutiveEmptyRows >= maxConsecutiveEmpty) {
                    console.log(`연속으로 ${consecutiveEmptyRows}행이 비어있어 파싱을 종료합니다. (행 ${i + 1})`);
                    break;
                }
                continue; // 빈 행은 건너뛰고 다음 학생 찾기
            }
            
            // 유효한 학생 데이터를 찾았으면 연속 빈 행 카운터 리셋
            consecutiveEmptyRows = 0;
            
            console.log(`학생 발견: 행 ${i + 1}, 번호: ${scoreRow[0]}, 이름: ${scoreRow[1] || '미기입'}`);
            
            const student = {
                number: scoreRow[0],
                name: scoreRow[1] || `학생${scoreRow[0]}`, // B열에서 학생 이름 추출
                scores: {},
                achievements: {},
                grades: {},
                ranks: {},
                subjectTotals: {},
                percentiles: {},
                sourceFormat: fileData.format,
                hasGradeReportSource: fileData.format === 'grade-report',
                hasXlsDataSource: fileData.format !== 'grade-report',
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
                
                // 석차등급 (문자 혼입 시 숫자만 추출)
                if (gradeRow && gradeRow[colIndex] !== undefined && gradeRow[colIndex] !== null) {
                    const gradeText = String(gradeRow[colIndex]).trim();
                    const gm = gradeText.match(/\d+/);
                    if (gm) {
                        student.grades[subject.name] = parseInt(gm[0], 10);
                    }
                }

                // 석차 (동석차 표기 포함 대비: 숫자만 추출)
                if (rankRow && rankRow[colIndex] !== undefined && rankRow[colIndex] !== null) {
                    const rankText = String(rankRow[colIndex]).trim();
                    const rm = rankText.match(/\d+/);
                    if (rm) {
                        student.ranks[subject.name] = parseInt(rm[0], 10);
                    }
                }

                // 수강자수 (과목별로 저장) 숫자만 추출
                if (totalRow && totalRow[colIndex] !== undefined && totalRow[colIndex] !== null) {
                    const totalText = String(totalRow[colIndex]).trim();
                    const tm = totalText.match(/\d+/);
                    if (tm) {
                        const total = parseInt(tm[0], 10);
                        student.subjectTotals[subject.name] = total;
                        // 기존 totalStudents는 호환을 위해 첫 과목에서만 설정 (전체 학생 수 표시용)
                        if (!student.totalStudents) {
                            student.totalStudents = total;
                        }
                    }
                }
            });

            // 가중평균등급 계산
            student.weightedAverageGrade = this.calculateWeightedAverageGrade(student, fileData.subjects);
            
            // 9등급 환산 평균 계산
            student.weightedAverage9Grade = this.calculateWeightedAverage9Grade(student, fileData.subjects);
            
            fileData.students.push(student);
        }
        
        console.log(`총 ${fileData.students.length}명의 학생 데이터를 파싱했습니다.`);
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
        
        // percentiles와 ranks 객체가 존재하는지 확인
        if (!student.percentiles || !student.ranks) {
            return null;
        }
        
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

    // 백분위를 9등급으로 환산하는 함수
    convertPercentileTo9Grade(percentile) {
        if (percentile === null || percentile === undefined || isNaN(percentile)) {
            return null;
        }
        
        if (percentile >= 96) return 1;  // 상위 4%
        if (percentile >= 89) return 2;  // 상위 11%
        if (percentile >= 77) return 3;  // 상위 23%
        if (percentile >= 60) return 4;  // 상위 40%
        if (percentile >= 40) return 5;  // 상위 60%
        if (percentile >= 23) return 6;  // 상위 77%
        if (percentile >= 11) return 7;  // 상위 89%
        if (percentile >= 4) return 8;   // 상위 96%
        return 9;                        // 하위 4%
    }

    getBusanGradeAverageToNineGradeTable() {
        return [
            { grade5: 1.08, grade9: 1.59 },
            { grade5: 1.16, grade9: 1.78 },
            { grade5: 1.24, grade9: 1.98 },
            { grade5: 1.33, grade9: 2.14 },
            { grade5: 1.42, grade9: 2.32 },
            { grade5: 1.50, grade9: 2.45 },
            { grade5: 1.66, grade9: 2.72 },
            { grade5: 1.83, grade9: 3.03 },
            { grade5: 2.00, grade9: 3.35 },
            { grade5: 2.16, grade9: 3.60 },
            { grade5: 2.33, grade9: 3.91 },
            { grade5: 2.50, grade9: 4.20 },
            { grade5: 2.66, grade9: 4.46 },
            { grade5: 2.83, grade9: 4.73 },
            { grade5: 3.00, grade9: 5.03 },
            { grade5: 3.16, grade9: 5.28 },
            { grade5: 3.33, grade9: 5.58 },
            { grade5: 3.50, grade9: 5.86 },
            { grade5: 3.66, grade9: 6.08 },
            { grade5: 3.83, grade9: 6.37 },
            { grade5: 4.00, grade9: 6.67 },
            { grade5: 4.16, grade9: 6.93 },
            { grade5: 4.33, grade9: 7.20 },
            { grade5: 4.50, grade9: 7.48 },
            { grade5: 4.66, grade9: 7.71 },
            { grade5: 4.83, grade9: 8.00 },
            { grade5: 5.00, grade9: 9.00 }
        ];
    }

    getGyeonggiGradeAverageToNineGradeTable() {
        return [
            { grade5: 1.00, grade9: 1.39 },
            { grade5: 1.083, grade9: 1.53 },
            { grade5: 1.167, grade9: 1.73 },
            { grade5: 1.250, grade9: 1.87 },
            { grade5: 1.333, grade9: 2.03 },
            { grade5: 1.417, grade9: 2.18 },
            { grade5: 1.500, grade9: 2.31 },
            { grade5: 1.583, grade9: 2.45 },
            { grade5: 1.667, grade9: 2.61 },
            { grade5: 1.750, grade9: 2.73 },
            { grade5: 1.833, grade9: 2.88 },
            { grade5: 1.917, grade9: 3.00 },
            { grade5: 2.000, grade9: 3.16 },
            { grade5: 2.083, grade9: 3.28 },
            { grade5: 2.167, grade9: 3.41 },
            { grade5: 2.250, grade9: 3.54 },
            { grade5: 2.333, grade9: 3.68 },
            { grade5: 2.417, grade9: 3.80 },
            { grade5: 2.500, grade9: 3.95 },
            { grade5: 2.583, grade9: 4.08 },
            { grade5: 2.667, grade9: 4.21 },
            { grade5: 2.750, grade9: 4.34 },
            { grade5: 2.833, grade9: 4.48 },
            { grade5: 2.917, grade9: 4.61 },
            { grade5: 3.000, grade9: 4.75 },
            { grade5: 3.083, grade9: 4.87 },
            { grade5: 3.167, grade9: 5.00 },
            { grade5: 3.250, grade9: 5.12 },
            { grade5: 3.333, grade9: 5.24 },
            { grade5: 3.417, grade9: 5.33 },
            { grade5: 3.500, grade9: 5.47 },
            { grade5: 3.583, grade9: 5.59 },
            { grade5: 3.667, grade9: 5.71 },
            { grade5: 3.750, grade9: 5.83 },
            { grade5: 3.833, grade9: 5.98 },
            { grade5: 3.917, grade9: 6.09 },
            { grade5: 4.000, grade9: 6.25 },
            { grade5: 4.083, grade9: 6.36 },
            { grade5: 4.167, grade9: 6.50 },
            { grade5: 4.250, grade9: 6.61 },
            { grade5: 4.333, grade9: 6.72 },
            { grade5: 4.417, grade9: 6.81 },
            { grade5: 4.500, grade9: 6.94 },
            { grade5: 4.583, grade9: 7.05 },
            { grade5: 4.667, grade9: 7.18 },
            { grade5: 4.750, grade9: 7.30 },
            { grade5: 4.833, grade9: 7.45 },
            { grade5: 4.917, grade9: 7.62 },
            { grade5: 5.000, grade9: 8.97 }
        ];
    }

    getBusanTopNineGradeRange() {
        return {
            grade5: 1.00,
            minGrade9: 1.15,
            maxGrade9: 1.45,
            display: '1.15~1.45'
        };
    }

    shouldDisplayBusanTopNineGradeRange(student, subjects) {
        if (!this.usesBusanNineGradeReference(student, subjects)) {
            return false;
        }

        const gradeAverage = student?.weightedAverageGrade;
        if (gradeAverage === null || gradeAverage === undefined || isNaN(gradeAverage)) {
            return false;
        }

        return Number(gradeAverage.toFixed(2)) <= this.getBusanTopNineGradeRange().grade5;
    }

    estimateNineGradeAverageFromReferenceTable(gradeAverage, table, options = {}) {
        if (gradeAverage === null || gradeAverage === undefined || isNaN(gradeAverage)) {
            return null;
        }

        if (table.length === 0) return null;

        const topRange = options.topRange || null;

        if (topRange) {
            if (gradeAverage <= topRange.grade5) {
                return topRange.maxGrade9;
            }

            if (gradeAverage < table[0].grade5) {
                const ratio = (gradeAverage - topRange.grade5) / (table[0].grade5 - topRange.grade5);
                return topRange.maxGrade9 + ((table[0].grade9 - topRange.maxGrade9) * ratio);
            }
        } else if (gradeAverage <= table[0].grade5) {
            return table[0].grade9;
        }

        const lastPoint = table[table.length - 1];
        if (gradeAverage >= lastPoint.grade5) {
            return lastPoint.grade9;
        }

        for (let i = 1; i < table.length; i++) {
            const prev = table[i - 1];
            const next = table[i];

            if (gradeAverage === next.grade5) {
                return next.grade9;
            }

            if (gradeAverage < next.grade5) {
                const ratio = (gradeAverage - prev.grade5) / (next.grade5 - prev.grade5);
                return prev.grade9 + ((next.grade9 - prev.grade9) * ratio);
            }
        }

        return lastPoint.grade9;
    }

    estimateNineGradeAverageFromFiveGradeAverage(gradeAverage) {
        return this.estimateNineGradeAverageFromReferenceTable(
            gradeAverage,
            this.getBusanGradeAverageToNineGradeTable(),
            { topRange: this.getBusanTopNineGradeRange() }
        );
    }

    estimateGyeonggiNineGradeAverageFromFiveGradeAverage(gradeAverage) {
        return this.estimateNineGradeAverageFromReferenceTable(
            gradeAverage,
            this.getGyeonggiGradeAverageToNineGradeTable()
        );
    }

    formatWeightedAverage9GradeDisplay(student, subjects) {
        if (!student || student.weightedAverage9Grade === null || student.weightedAverage9Grade === undefined) {
            return 'N/A';
        }

        if (this.shouldDisplayBusanTopNineGradeRange(student, subjects)) {
            return this.getBusanTopNineGradeRange().display;
        }

        return student.weightedAverage9Grade.toFixed(2);
    }

    getRegionalNineGradeReferenceDisplays(student, subjects) {
        if (!this.usesRegionalNineGradeReference(student, subjects)) {
            return [];
        }

        const displays = [];
        const busanDisplay = this.formatWeightedAverage9GradeDisplay(student, subjects);
        const gyeonggiEstimate = this.estimateGyeonggiNineGradeAverageFromFiveGradeAverage(student?.weightedAverageGrade);

        if (busanDisplay !== 'N/A') {
            displays.push({ label: '부산', value: busanDisplay });
        }

        if (gyeonggiEstimate !== null) {
            displays.push({ label: '경기', value: gyeonggiEstimate.toFixed(2) });
        }

        return displays;
    }

    getNineGradeReferenceNoteHtml(student, subjects) {
        if (!this.usesRegionalNineGradeReference(student, subjects)) {
            return '';
        }

        return '<span class="summary-note">환산기준 : 부산시교육청 자료 / 경기도교육청 자료(2학기 발표 누적비 기준)</span>';
    }

    renderNineGradeSummaryContent(student, subjects) {
        const regionalDisplays = this.getRegionalNineGradeReferenceDisplays(student, subjects);

        if (regionalDisplays.length === 0) {
            return `<span class="summary-value orange">${this.formatWeightedAverage9GradeDisplay(student, subjects)}</span>`;
        }

        const regionalHtml = regionalDisplays
            .map(item => `
                <span class="summary-reference-item">
                    <span class="summary-reference-label">${item.label}</span>
                    <span class="summary-reference-value">${item.value}</span>
                </span>
            `)
            .join('');

        return `
            <span class="summary-reference-list">${regionalHtml}</span>
            ${this.getNineGradeReferenceNoteHtml(student, subjects)}
        `;
    }

    // (제거됨) 5등급 기반 9등급 하한 강제 로직은 오류 탐지 가시성을 해치므로 사용하지 않음

    calculateExactWeightedAverage9Grade(student, subjects) {
        let totalGradePoints = 0;
        let totalCredits = 0;
        
        // percentiles와 ranks 객체가 존재하는지 확인
        if (!student.percentiles || !student.ranks) {
            return null;
        }
        
        subjects.forEach(subject => {
            const percentile = student.percentiles[subject.name];
            const rank = student.ranks[subject.name];
            // 석차가 있는 과목만 계산에 포함
            if (percentile !== undefined && percentile !== null && rank !== undefined && rank !== null && !isNaN(rank)) {
                const grade9 = this.convertPercentileTo9Grade(percentile);
                if (grade9 !== null) {
                    totalGradePoints += grade9 * subject.credits;
                    totalCredits += subject.credits;
                }
            }
        });
        
        return totalCredits > 0 ? totalGradePoints / totalCredits : null;
    }

    // 9등급 가중평균 계산
    calculateWeightedAverage9Grade(student, subjects) {
        const exactWeightedAverage9Grade = this.calculateExactWeightedAverage9Grade(student, subjects);
        if (exactWeightedAverage9Grade !== null) {
            return exactWeightedAverage9Grade;
        }

        const isGradeReportSource = student &&
            (student.hasGradeReportSource || student.sourceFormat === 'grade-report');

        if (!isGradeReportSource) {
            return null;
        }

        return this.estimateNineGradeAverageFromFiveGradeAverage(student.weightedAverageGrade);
    }

    usesRegionalNineGradeReference(student, subjects) {
        if (!student || student.weightedAverage9Grade === null || student.weightedAverage9Grade === undefined) {
            return false;
        }

        const isGradeReportSource = student.hasGradeReportSource || student.sourceFormat === 'grade-report';
        if (!isGradeReportSource) {
            return false;
        }

        return this.calculateExactWeightedAverage9Grade(student, subjects) === null;
    }

    usesBusanNineGradeReference(student, subjects) {
        return this.usesRegionalNineGradeReference(student, subjects);
    }


    displayResults() {
        document.getElementById('results').style.display = 'block';
        this.displaySubjectAverages();
        this.displayGradeAnalysis();
        this.displayStudentAnalysis();
        this.applyRankVisibilityState();

        // Restore tab from URL hash, or default to grade-analysis
        const hash = location.hash.replace('#', '');
        const targetTab = (hash && document.querySelector(`[data-tab="${hash}"]`)) ? hash : 'grade-analysis';
        if (document.querySelector(`[data-tab="${targetTab}"]`) && document.getElementById(`${targetTab}-tab`)) {
            this.switchTab(targetTab);
        }
    }

    // Export a complete deployment package with all files
    async exportAsHtml(createFolder = true) {
        if (!this.combinedData) {
            this.showError('먼저 파일을 분석하세요.');
            return;
        }

        const timestamp = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const folderName = `analysis_${timestamp.getFullYear()}${pad(timestamp.getMonth()+1)}${pad(timestamp.getDate())}_${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}`;

        // Serialize current analysis data
        const dataJson = JSON.stringify(this.combinedData);

        // Helper to fetch text
        const safeFetchText = async (url) => {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.text();
            } catch (e) {
                console.warn('리소스 로드 실패:', url, e);
                return '';
            }
        };

        // Get CSS content
        let cssContent = await safeFetchText('style.css');
        
        // CSS 내용 확인 및 디버깅
        console.log('CSS 내용 길이:', cssContent.length);
        if (!cssContent || cssContent.length < 100) {
            console.warn('CSS를 가져오지 못함, 대체 방법 사용');
            // style 태그에서 CSS 추출 시도
            const styleElement = document.querySelector('link[href="style.css"]');
            if (styleElement) {
                try {
                    const response = await fetch(styleElement.href);
                    cssContent = await response.text();
                } catch (e) {
                    console.error('CSS 대체 로드 실패:', e);
                    // 마지막 fallback - 기본 스타일 제공
                    cssContent = this.getFallbackCSS();
                }
            } else {
                cssContent = this.getFallbackCSS();
            }
        }

        // Get JS content and modify for standalone use
        let jsContent = await safeFetchText('script.js');
        console.log('JS 내용 길이:', jsContent.length);
        if (jsContent) {
            jsContent = this.createStandaloneScript(jsContent);
            console.log('수정된 JS 내용 길이:', jsContent.length);
        } else {
            console.error('JavaScript 파일을 로드할 수 없습니다');
            jsContent = this.getFallbackJS();
        }

        // Create HTML file content
        const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>배포용 성적 분석 뷰어</title>
    <style>
        /* 메인 CSS */
        ${cssContent}
        
        /* 차트 대체 스타일 */
        .chart-placeholder {
            width: 100%;
            height: 350px;
            background: #f8f9fa;
            border: 2px dashed #dee2e6;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6c757d;
            font-size: 1.1rem;
            border-radius: 8px;
            flex-direction: column;
            padding: 20px;
        }
        .chart-placeholder h4 {
            margin-bottom: 15px;
            color: #333;
        }
        .chart-placeholder p {
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>성적 분석 결과 (배포용)</h1>
            <p>업로드 없이 저장된 분석 결과를 표시합니다</p>
        </header>
        <div class="upload-section" style="display:none;"></div>
        ${document.getElementById('results') ? document.getElementById('results').outerHTML : '<div id="results" class="results-section"></div>'}
        <div id="loading" class="loading" style="display:none;"></div>
        <div id="error" class="error-message" style="display:none;"></div>
        <footer class="app-footer">
            <div class="footer-right">
                <div class="credits">2026 강원진학센터 입시분석팀 남궁연(강원 설악고등학교)</div>
                <a class="help-btn" href="https://namgungyeon.tistory.com/133" target="_blank" rel="noopener" title="도움말 보기">❔ 도움말</a>
            </div>
        </footer>
    </div>

    <script>
        // Preloaded analysis data embedded for offline viewing
        window.PRELOADED_DATA = ${dataJson};
    </script>
    <script src="script.js"></script>
</body>
</html>`;

        // Create ZIP file with JSZip (if available) or download files separately
        if (typeof JSZip !== 'undefined' && cssContent.length > 100) {
            // Use JSZip if available and CSS loaded successfully
            const zip = new JSZip();
            zip.file("index.html", htmlContent);
            zip.file("style.css", cssContent || "/* CSS 로드 실패 */");
            zip.file("script.js", jsContent || "/* JS 로드 실패 */");
            zip.file("README.txt", 
                "배포용 성적 분석 뷰어\\n" +
                "========================\\n\\n" +
                "사용법:\\n" +
                "1. index.html 파일을 웹브라우저에서 열어주세요\\n" +
                "2. 업로드 없이 바로 분석 결과를 확인할 수 있습니다\\n" +
                "3. index.html에 CSS가 내장되어 있어 단독으로 실행 가능합니다\\n\\n" +
                "파일 구성:\\n" +
                "- index.html: 메인 페이지 (CSS 내장)\\n" +
                "- style.css: 별도 스타일 파일 (참고용)\\n" +
                "- script.js: 분석 스크립트\\n\\n" +
                "2026 강원진학센터 입시분석팀 남궁연(강원 설악고등학교)\\n" +
                "링크: https://namgungyeon.tistory.com/133"
            );
            
            const content = await zip.generateAsync({type: "blob"});
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = folderName + ".zip";
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
        } else {
            // Fallback: download files separately
            this.downloadFile(htmlContent, "index.html", "text/html");
            setTimeout(() => this.downloadFile(cssContent, "style.css", "text/css"), 500);
            setTimeout(() => this.downloadFile(jsContent, "script.js", "application/javascript"), 1000);
            setTimeout(() => {
                const readme = "배포용 성적 분석 뷰어\\n========================\\n\\n사용법:\\n1. 모든 파일을 같은 폴더에 저장하세요\\n2. index.html 파일을 웹브라우저에서 열어주세요\\n\\n2026 강원진학센터 입시분석팀 남궁연(강원 설악고등학교)\\n링크: https://namgungyeon.tistory.com/133";
                this.downloadFile(readme, "README.txt", "text/plain");
            }, 1500);
            
            this.showToast('모든 파일을 같은 폴더에 저장한 후 index.html을 열어서 사용하세요.', 'info', '배포용 파일 다운로드', 8000);
        }
    }

    // Export HTML that references external style.css and script.js (paired files)
    async exportAsPairedHtml() {
        if (!this.combinedData) {
            this.showError('먼저 파일을 분석하세요.');
            return;
        }
        // Helper fetch
        const safeFetchText = async (url) => {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.text();
            } catch (_) { return ''; }
        };

        // 1) index.html 생성 (원본 파일 선호, 실패 시 현재 문서 기반) + PRELOADED_DATA 주입
        const parser = new DOMParser();
        let indexSrc = await (async () => {
            try {
                const res = await fetch('index.html', { cache: 'no-cache' });
                if (res && res.ok) return await res.text();
            } catch (_) {}
            return document.documentElement.outerHTML;
        })();
        const doc = parser.parseFromString(indexSrc, 'text/html');
        const preload = doc.createElement('script');
        preload.textContent = `window.APP_BUILD_UTC = new Date().toISOString();\nwindow.PRELOADED_DATA = ${JSON.stringify(this.combinedData)};`;
        const appScript = doc.querySelector('script[src="script.js"]');
        if (appScript) appScript.before(preload); else { doc.body.appendChild(preload); const s = doc.createElement('script'); s.src = 'script.js'; doc.body.appendChild(s); }
        const indexOut = '<!DOCTYPE html>' + doc.documentElement.outerHTML;

        // 2) 현재 style.css, script.js 내용 확보 (정확히 동일 파일을 사용 - 실패 시 에러 표시)
        let cssText = await safeFetchText('style.css');
        let jsText = await safeFetchText('script.js');
        // fetch 실패 시, 사용자가 로컬 파일을 직접 선택해서 복사할 수 있도록 안내
        if ((!cssText || !jsText) && window.showOpenFilePicker) {
            try {
                if (!cssText) {
                    const [cssHandle] = await window.showOpenFilePicker({
                        multiple: false,
                        types: [{ description: 'CSS', accept: { 'text/css': ['.css'] } }]
                    });
                    const cssFile = await cssHandle.getFile();
                    cssText = await cssFile.text();
                }
            } catch (e) { /* 사용자가 취소한 경우 등은 무시 */ }
            try {
                if (!jsText) {
                    const [jsHandle] = await window.showOpenFilePicker({
                        multiple: false,
                        types: [{ description: 'JavaScript', accept: { 'application/javascript': ['.js'] } }]
                    });
                    const jsFile = await jsHandle.getFile();
                    jsText = await jsFile.text();
                }
            } catch (e) { /* 무시 */ }
        }
        if (!cssText || !jsText) {
            console.warn('원본 style.css/script.js를 일부 가져오지 못했습니다. ZIP에는 빈 파일이 포함될 수 있습니다.');
        }

        // 3) 항상 ZIP으로 같은 폴더 평면 구조로 다운로드
        const zip = new JSZip();
        zip.file('index.html', indexOut);
        zip.file('style.css', cssText || '/* style */');
        zip.file('script.js', jsText || '/* script */');
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        a.download = `analysis_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
        return;
    }

    async generateExactSnapshotHtmlTemplate() {
        // 차트가 모두 그려지도록 보장 (애니메이션 없이 최신 상태로 업데이트)
        await this.ensureChartsRendered();
        // 렌더 안정화 대기(레이아웃/폰트/애니메이션 마무리)
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));

        const cssContent = await this.getStyleCSS();
        const container = document.querySelector('.container');
        if (!container) throw new Error('내보낼 컨테이너를 찾을 수 없습니다.');

        const containerClone = container.cloneNode(true);
        const origCanvases = container.querySelectorAll('canvas');
        const cloneCanvases = containerClone.querySelectorAll('canvas');

        for (let i = 0; i < cloneCanvases.length; i++) {
            const srcCanvas = origCanvases[i];
            const dstCanvas = cloneCanvases[i];
            if (srcCanvas && dstCanvas && srcCanvas.toDataURL) {
                try {
                    const img = document.createElement('img');
                    img.src = srcCanvas.toDataURL('image/png');
                    const rect = srcCanvas.getBoundingClientRect();
                    img.style.width = Math.max(1, Math.round(rect.width)) + 'px';
                    img.style.height = Math.max(1, Math.round(rect.height)) + 'px';
                    img.className = dstCanvas.className || '';
                    if (dstCanvas.id) img.id = dstCanvas.id;
                    img.alt = dstCanvas.getAttribute('aria-label') || 'chart-image';
                    dstCanvas.replaceWith(img);
                } catch (_) {
                    // 실패 시 캔버스 그대로 둔다.
                }
            }
        }

        const title = document.title || '(2022개정) 고등학교 내신 분석 프로그램 Lite';
        return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
${cssContent}
  </style>
</head>
<body>
${containerClone.outerHTML}
</body>
</html>`;
    }

    // 현재 화면 상태 그대로(차트 포함) 정적인 HTML로 저장
    async exportAsExactSnapshotHtml() {
        if (!this.combinedData) {
            this.showError('먼저 파일을 분석하세요.');
            return;
        }

        try {
            const html = await this.generateExactSnapshotHtmlTemplate();

            // 다운로드 (BOM 포함: 한글 표시 안전)
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + html], { type: 'text/html;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const filename = `학생성적분석_스냅샷_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.html`;
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);

        } catch (err) {
            console.error('스냅샷 HTML 생성 오류:', err);
            this.showError('스냅샷 HTML 생성 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)));
        }
    }

    async ensureChartsRendered() {
        try {
            if (this.scatterChart && typeof this.scatterChart.update === 'function') {
                this.scatterChart.update('none');
            }
        } catch (_) {}
        try {
            if (this.barChart && typeof this.barChart.update === 'function') {
                this.barChart.update('none');
            }
        } catch (_) {}
        try {
            if (this.studentPercentileChart && typeof this.studentPercentileChart.update === 'function') {
                this.studentPercentileChart.update('none');
            }
        } catch (_) {}
    }
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }

    getFallbackCSS() {
        // CSS 로드가 실패했을 때 사용할 기본 스타일
        return `
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%);
    min-height: 100vh;
    padding: 20px;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    background: white;
    border-radius: 15px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

header {
    background: #8fbaf7;
    color: white;
    padding: 40px;
    text-align: center;
}

header h1 {
    font-size: 2.5rem;
    margin-bottom: 10px;
    font-weight: 300;
}

.results-section {
    padding: 40px;
}

.tabs {
    display: flex;
    border-bottom: 2px solid #eee;
    margin-bottom: 30px;
}

.tab-btn {
    flex: 1;
    padding: 15px 20px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: #666;
    transition: all 0.3s ease;
    border-bottom: 3px solid transparent;
}

.tab-btn.active {
    color: #4facfe;
    border-bottom-color: #4facfe;
    background: rgba(79, 172, 254, 0.05);
}

.tab-content {
    display: none;
}

.tab-content.active {
    display: block;
}

.tab-content h2 {
    color: #333;
    margin-bottom: 25px;
    font-size: 1.8rem;
    font-weight: 400;
}

.subject-averages {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.subject-item {
    background: white;
    border-radius: 10px;
    padding: 25px;
    border-left: 5px solid #4facfe;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.students-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 20px;
}

.student-card {
    background: white;
    border-radius: 15px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(0, 0, 0, 0.05);
    overflow: hidden;
}

.grade-analysis-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
}

.chart-section {
    background: #f8f9fa;
    border-radius: 10px;
    padding: 25px;
    text-align: center;
}

.stats-section {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    background: #f8f9fa;
    border-radius: 10px;
    padding: 25px;
}

.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 하단 크레딧 푸터 (fallback) */
.app-footer {
    padding: 12px 40px 24px 40px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
}
.app-footer .footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
}
.app-footer .credits {
    text-align: right;
    font-size: 0.85rem;
    color: #ffffff; /* 흰색으로 변경 */
    opacity: 0.95;
}
.app-footer .credits a:not(.help-btn) {
    color: #adb5bd;
    text-decoration: none;
    border-bottom: 1px dashed rgba(173,181,189,0.5);
}
.app-footer .credits a:not(.help-btn):hover {
    color: #6c757d;
    border-bottom-color: rgba(108,117,125,0.7);
}

/* 도움말 버튼 */
.help-btn {
    display: inline-block;
    padding: 6px 12px;
    font-size: 0.85rem;
    line-height: 1;
    border-radius: 999px;
    color: #4facfe;
    background: #ffffff;
    border: 1px solid #4facfe;
    text-decoration: none;
    transition: all 0.2s ease;
}
.help-btn:hover {
    color: #ffffff;
    background: #4facfe;
    box-shadow: 0 6px 16px rgba(79, 172, 254, 0.25);
}
`;
    }

    getFallbackJS() {
        // JavaScript 로드가 실패했을 때 사용할 기본 스크립트
        return `
class ScoreAnalyzer {
    constructor() {
        this.combinedData = window.PRELOADED_DATA || null;
        this.initializeEventListeners();
        
        if (this.combinedData) {
            console.log('사전 로드된 데이터 발견:', this.combinedData);
            const introHeader = document.querySelector('.container > header');
            if (introHeader) introHeader.style.display = 'none';
            const upload = document.querySelector('.upload-section');
            if (upload) upload.style.display = 'none';
            const results = document.getElementById('results');
            if (results) results.style.display = 'block';
            this.displayResults();
        }
    }
    
    initializeEventListeners() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }
    
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName + '-tab').classList.add('active');
    }
    
    displayResults() {
        if (!this.combinedData) return;
        
        document.getElementById('results').style.display = 'block';
        this.displaySubjectAverages();
        this.displayGradeAnalysis();
        this.displayStudentAnalysis();
        if (document.querySelector('[data-tab="grade-analysis"]') && document.getElementById('grade-analysis-tab')) {
            this.switchTab('grade-analysis');
        }
    }
    
    displaySubjectAverages() {
        const container = document.getElementById('subjectAverages');
        if (!container || !this.combinedData) return;
        
        container.innerHTML = '';
        this.combinedData.subjects.forEach(subject => {
            const div = document.createElement('div');
            div.className = 'subject-item';
            div.innerHTML = '<h3>' + subject.name + '</h3><p>평균: ' + (subject.average || 0).toFixed(1) + '점</p>';
            container.appendChild(div);
        });
    }
    
    displayGradeAnalysis() {
        // 간단한 통계만 표시
        const overallAvg = document.getElementById('overallAverage');
        const stdDev = document.getElementById('standardDeviation');
        
        if (this.combinedData && this.combinedData.students) {
            const grades = this.combinedData.students
                .filter(s => s.weightedAverageGrade)
                .map(s => s.weightedAverageGrade);
                
            if (grades.length > 0) {
                const avg = grades.reduce((sum, g) => sum + g, 0) / grades.length;
                if (overallAvg) overallAvg.textContent = avg.toFixed(2);
                
                const variance = grades.reduce((sum, g) => sum + Math.pow(g - avg, 2), 0) / grades.length;
                if (stdDev) stdDev.textContent = Math.sqrt(variance).toFixed(2);
            }
        }
        
        // 차트 대신 메시지 표시
        const scatterChart = document.getElementById('scatterChart');
        const barChart = document.getElementById('barChart');
        
        if (scatterChart && scatterChart.parentElement) {
            scatterChart.parentElement.innerHTML = '<div class="chart-placeholder"><h4>차트는 배포용에서 제외됨</h4><p>통계 정보는 위에서 확인하세요</p></div>';
        }
        
        if (barChart && barChart.parentElement) {
            barChart.parentElement.innerHTML = '<div class="chart-placeholder"><h4>차트는 배포용에서 제외됨</h4><p>통계 정보는 위에서 확인하세요</p></div>';
        }
    }
    
    displayStudentAnalysis() {
        // 기본적인 학생 목록만 표시
        const container = document.getElementById('studentTable');
        if (!container || !this.combinedData) return;
        
        container.innerHTML = '<p>학생 분석 데이터가 로드되었습니다. 총 ' + this.combinedData.students.length + '명</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ScoreAnalyzer();
});
`;
    }

    createStandaloneScript(originalScript) {
        // Chart.js 의존성을 제거하고 더 안전한 방식으로 변경
        let modifiedScript = originalScript;
        
        try {
            // 1. Chart.js 관련 전역 참조 제거
            modifiedScript = modifiedScript.replace(/Chart\.register\(.*?\);?/g, '// Chart.js 제거됨');
            modifiedScript = modifiedScript.replace(/ChartDataLabels/g, '{}');
            
            // 2. 차트 생성 메서드들을 간단한 플레이스홀더로 교체
            modifiedScript = modifiedScript.replace(
                /createScatterChart\([^{]*\{[^}]*\{[\s\S]*?\}\s*\}\s*\}/g,
                `createScatterChart(students) {
                    const ctx = document.getElementById('scatterChart');
                    if (!ctx || !ctx.parentElement) return;
                    ctx.parentElement.innerHTML = '<div class="chart-placeholder"><h4>산점도 차트</h4><p>배포용에서는 차트가 제외되었습니다</p></div>';
                }`
            );
            
            modifiedScript = modifiedScript.replace(
                /createGradeDistributionChart\([^{]*\{[^}]*\{[\s\S]*?\}\s*\}\s*\}/g,
                `createGradeDistributionChart(students) {
                    const ctx = document.getElementById('barChart');
                    if (!ctx || !ctx.parentElement) return;
                    ctx.parentElement.innerHTML = '<div class="chart-placeholder"><h4>분포 차트</h4><p>배포용에서는 차트가 제외되었습니다</p></div>';
                }`
            );
            
            modifiedScript = modifiedScript.replace(
                /createStudentPercentileChart\([^{]*\{[^}]*\{[\s\S]*?\}\s*\}\s*\}/g,
                `createStudentPercentileChart(student) {
                    const ctx = document.getElementById('studentPercentileChart');
                    if (!ctx || !ctx.parentElement) return;
                    ctx.parentElement.innerHTML = '<div class="chart-placeholder"><h4>학생별 차트</h4><p>배포용에서는 차트가 제외되었습니다</p></div>';
                }`
            );
            
            // 3. 차트 파괴 관련 코드 제거
            modifiedScript = modifiedScript.replace(/if \(this\.\w*Chart\) \{\s*this\.\w*Chart\.destroy\(\);\s*\}/g, '// 차트 파괴 코드 제거됨');
            
            // 4. new Chart 생성자 호출 제거
            modifiedScript = modifiedScript.replace(/this\.\w*Chart = new Chart\([^;]*\);/g, '// Chart 생성 제거됨');
            
            console.log('Chart.js 의존성 제거 완료');
            
        } catch (e) {
            console.error('스크립트 수정 중 오류 발생:', e);
            console.warn('기본 fallback 스크립트 사용');
            return this.getFallbackJS();
        }
        
        return modifiedScript;
    }

    displaySubjectAverages() {
        const container = document.getElementById('subjectAverages');
        container.innerHTML = '';

        if (!this.combinedData) return;

        // Build subject filter bar
        const groups = new Set();
        this.combinedData.subjects.forEach(s => groups.add(this.getSubjectGroup(s.name, s.sourceGroup)));
        let filterBar = document.getElementById('subjectFilterBar');
        if (!filterBar) {
            filterBar = document.createElement('div');
            filterBar.id = 'subjectFilterBar';
            filterBar.className = 'subject-filter-bar';
            container.parentElement.insertBefore(filterBar, container);
        }
        filterBar.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'subject-filter-btn active';
        allBtn.textContent = '전체';
        allBtn.addEventListener('click', () => {
            filterBar.querySelectorAll('.subject-filter-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            container.querySelectorAll('.subject-item').forEach(el => el.style.display = '');
        });
        filterBar.appendChild(allBtn);
        groups.forEach(group => {
            const btn = document.createElement('button');
            btn.className = 'subject-filter-btn';
            btn.textContent = group;
            btn.addEventListener('click', () => {
                filterBar.querySelectorAll('.subject-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                container.querySelectorAll('.subject-item').forEach(el => {
                    el.style.display = el.dataset.group === group ? '' : 'none';
                });
            });
            filterBar.appendChild(btn);
        });

        this.combinedData.subjects.forEach(subject => {
            const subjectDiv = document.createElement('div');
            subjectDiv.className = 'subject-item';
            subjectDiv.dataset.group = this.getSubjectGroup(subject.name, subject.sourceGroup);

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

        // 평균등급별로 학생을 정렬 (1등급부터 5등급 순)
        const sortedStudents = [...students].sort((a, b) => a.weightedAverageGrade - b.weightedAverageGrade);
        
        // 각 평균등급별로 같은 등급의 학생 수만큼 Y축에 분산
        const gradeGroups = {};
        students.forEach(student => {
            const grade = student.weightedAverageGrade.toFixed(2);
            if (!gradeGroups[grade]) {
                gradeGroups[grade] = [];
            }
            gradeGroups[grade].push(student);
        });

        const scatterData = [];
        Object.keys(gradeGroups).forEach(grade => {
            const studentsInGrade = gradeGroups[grade];
            studentsInGrade.forEach((student, index) => {
                // 같은 등급의 학생들을 Y축에서 약간씩 분산 (중앙 기준으로 ±0.05 범위)
                const yOffset = studentsInGrade.length > 1 
                    ? (index - (studentsInGrade.length - 1) / 2) * 0.02 
                    : 0;
                
                scatterData.push({
                    x: parseFloat(grade),
                    y: 0.5 + yOffset, // Y축 중앙(0.5) 기준으로 약간 분산
                    student: student
                });
            });
        });

        // 누적 비율 계산을 위한 데이터 생성
        const cumulativeData = [];
        const totalStudents = sortedStudents.length;
        
        // 0.1 단위로 등급 구간을 나누어 누적 비율 계산
        for (let grade = 1.0; grade <= 5.0; grade += 0.1) {
            const studentsUpToGrade = sortedStudents.filter(s => s.weightedAverageGrade <= grade).length;
            const cumulativePercentage = (studentsUpToGrade / totalStudents) * 100;
            
            cumulativeData.push({
                x: parseFloat(grade.toFixed(1)),
                y: cumulativePercentage
            });
        }

        this.scatterChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '누적 비율',
                    type: 'line',
                    data: cumulativeData,
                    borderColor: 'rgba(231, 76, 60, 1)',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: 'rgba(231, 76, 60, 1)',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 1,
                    // 차트 영역 경계에서 점/선이 잘리지 않도록 여유를 둠
                    clip: 8
                }, {
                    label: '학생별 평균등급',
                    type: 'scatter',
                    data: scatterData,
                    backgroundColor: function(context) {
                        const grade = context.parsed.x;
                        if (grade <= 1.5) return 'rgba(26, 188, 156, 0.6)';
                        if (grade <= 2.0) return 'rgba(52, 152, 219, 0.6)';
                        if (grade <= 2.5) return 'rgba(155, 89, 182, 0.6)';
                        if (grade <= 3.0) return 'rgba(241, 196, 15, 0.6)';
                        if (grade <= 3.5) return 'rgba(230, 126, 34, 0.6)';
                        if (grade <= 4.0) return 'rgba(231, 76, 60, 0.6)';
                        if (grade <= 4.5) return 'rgba(189, 195, 199, 0.6)';
                        return 'rgba(127, 140, 141, 0.6)';
                    },
                    borderColor: function(context) {
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
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderWidth: 2,
                    pointHoverBorderWidth: 3,
                    yAxisID: 'y',
                    order: 2,
                    // 차트 영역 경계에서 점이 잘리지 않도록 여유를 둠
                    clip: 8
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
                        // 1~5 눈금과 격자가 정확히 보이도록 범위를 고정
                        min: 1.0,
                        max: 5.0,
                        reverse: true,
                        ticks: {
                            stepSize: 0.5,
                            callback: function(value) {
                                const roundedValue = Math.round(value * 10) / 10;
                                if (roundedValue >= 1.0 && roundedValue <= 5.0 && (roundedValue * 2) % 1 === 0) {
                                    return roundedValue.toFixed(1);
                                }
                                return '';
                            },
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
                        type: 'linear',
                        display: false,
                        position: 'left',
                        min: 0,
                        max: 1
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
                                if (context[0].datasetIndex === 0) {
                                    // 선 그래프 (누적 비율)
                                    return `평균등급 ${context[0].parsed.x.toFixed(1)} 이하`;
                                } else {
                                    // 산점도 (학생)
                                    const student = context[0].raw.student;
                                    return `${student.name}`;
                                }
                            },
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    // 선 그래프 (누적 비율)
                                    return `${context.parsed.y.toFixed(1)}% : ${context.parsed.x.toFixed(1)}등급`;
                                } else {
                                    // 산점도 (학생)
                                    return `평균등급: ${context.parsed.x.toFixed(2)}`;
                                }
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
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
                    yAxisID: 'y',
                    // 가장자리 막대가 잘리지 않도록 여유
                    clip: 8
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
                    yAxisID: 'y1',
                    // 선의 끝 점이 잘리지 않도록 여유
                    clip: 8
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
                        // 첫/마지막 구간에 여백을 줘서 눈금과 막대가 잘리지 않게 함
                        offset: true,
                        ticks: {
                            font: {
                                family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                                size: 12,
                                weight: '500'
                            },
                            color: '#5a6c7d',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)',
                            lineWidth: 1
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
        const studentNameSearch = document.getElementById('studentNameSearch');
        
        const selectedGrade = gradeSelect.value;
        const selectedClass = classSelect.value;
        const nameQuery = (studentNameSearch && studentNameSearch.value ? studentNameSearch.value.trim() : '');

        let students = this.combinedData.students;
        if (selectedGrade) {
            students = students.filter(s => s.grade == selectedGrade);
        }
        if (selectedClass) {
            students = students.filter(s => s.class == selectedClass);
        }
        if (nameQuery) {
            const q = nameQuery.toLowerCase();
            students = students.filter(s => (s.name && s.name.toLowerCase().includes(q)) || (s.originalNumber && String(s.originalNumber).includes(q)));
        }

        studentSelect.innerHTML = '<option value="">학생 선택</option>';
        students.forEach(student => {
            const option = document.createElement('option');
            option.value = student.number;
            option.textContent = `${student.originalNumber}번 - ${student.name}`;
            studentSelect.appendChild(option);
        });
        // 단일 매치 시 자동 선택
        const showBtn = document.getElementById('showStudentDetail');
        if (students.length === 1) {
            studentSelect.value = students[0].number;
            if (showBtn) showBtn.disabled = false;
        } else {
            if (showBtn) showBtn.disabled = !studentSelect.value;
        }
    }

    getStudentDetailNavigationStudents() {
        if (!this.combinedData) return [];

        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentNameSearch = document.getElementById('studentNameSearch');

        const selectedGrade = gradeSelect ? gradeSelect.value : '';
        const selectedClass = classSelect ? classSelect.value : '';
        const detailQuery = studentNameSearch && studentNameSearch.value
            ? studentNameSearch.value.trim().toLowerCase()
            : '';
        let students = this.combinedData.students;
        if (selectedGrade) {
            students = students.filter(s => String(s.grade) === String(selectedGrade));
        }
        if (selectedClass) {
            students = students.filter(s => String(s.class) === String(selectedClass));
        }
        if (detailQuery) {
            students = students.filter(s =>
                (s.name && s.name.toLowerCase().includes(detailQuery)) ||
                (s.originalNumber && String(s.originalNumber).includes(detailQuery))
            );
        }

        return students;
    }

    navigateStudentDetail(offset) {
        const studentSelect = document.getElementById('studentSelect');
        const currentStudentId = studentSelect ? studentSelect.value : '';
        const navigationStudents = this.getStudentDetailNavigationStudents();
        if (!currentStudentId || navigationStudents.length === 0) return;

        const currentIndex = navigationStudents.findIndex(student => String(student.number) === String(currentStudentId));
        if (currentIndex === -1) return;

        const nextIndex = currentIndex + offset;
        if (nextIndex < 0 || nextIndex >= navigationStudents.length) return;

        const targetStudent = navigationStudents[nextIndex];
        if (studentSelect) {
            studentSelect.value = targetStudent.number;
        }
        this.renderStudentDetail(targetStudent);
    }

    renderStudentTable(students, subjects, container) {
        container.innerHTML = '';

        if (students.length === 0) {
            container.innerHTML = '<p>학생 데이터가 없습니다.</p>';
            return;
        }

        // Sort controls
        const sortBar = document.createElement('div');
        sortBar.className = 'subject-filter-bar';
        sortBar.style.marginBottom = '14px';
        const sortLabel = document.createElement('span');
        sortLabel.textContent = '정렬:';
        sortLabel.style.cssText = 'font-size:0.85rem;font-weight:600;color:var(--text-secondary);padding:7px 0;';
        sortBar.appendChild(sortLabel);
        const sortOptions = [
            { key: 'number', label: '번호순' },
            { key: 'name', label: '이름순' },
            { key: 'avgGrade', label: '평균등급순' },
            ...(this._showRankings ? [{ key: 'rank', label: '순위순' }] : [])
        ];
        sortOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'subject-filter-btn' + (this._sortColumn === opt.key ? ' active' : '') + (opt.key === 'rank' ? ' rank-sort-control' : '');
            const arrow = this._sortColumn === opt.key ? (this._sortAsc ? ' \u25B2' : ' \u25BC') : '';
            btn.textContent = opt.label + arrow;
            btn.addEventListener('click', () => this._toggleSort(opt.key));
            sortBar.appendChild(btn);
        });
        container.appendChild(sortBar);

        // 학생 카드 방식으로 변경
        const studentsGrid = document.createElement('div');
        studentsGrid.className = 'students-grid';

        students.forEach(student => {
            const studentCard = document.createElement('div');
            studentCard.className = 'student-card';
            
            // 과목별 평균 백분위 계산
            const weightedAveragePercentile = this.calculateWeightedAveragePercentile(student, subjects);
            
            // 평균등급 기준 순위
            const averageGradeRank = student.averageGradeRank;
            const sameGradeCount = student.sameGradeCount;
            const totalGradedStudents = student.totalGradedStudents;
            
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
                                ${hasGrade && (percentile !== undefined && percentile !== null) ? `<span class="subject-percentile">${percentile}%</span>` : ''}
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
                        <div class="summary-row">
                            <div class="summary-metric-inline">
                                <span class="metric-label">평균등급</span>
                                <span class="metric-value">${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                            </div>
                            ${averageGradeRank !== null && averageGradeRank !== undefined ? `
                            <div class="summary-metric-inline ranking-visibility-target">
                                <span class="metric-label">등급순위</span>
                                <span class="metric-value">${averageGradeRank}/${totalGradedStudents}위${sameGradeCount > 1 ? ` (${sameGradeCount}명)` : ''}</span>
                            </div>
                            ` : ''}
                        </div>
                        ${weightedAveragePercentile ? `
                        <div class="summary-row">
                            <div class="summary-metric-inline">
                                <span class="metric-label">과목평균백분위</span>
                                <span class="metric-value">${weightedAveragePercentile.toFixed(1)}%</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="student-subjects">
                    ${subjectsHTML}
                </div>
                <div class="student-card-footer">
                    <span class="grade-subjects-count">등급 산출 과목: ${hasGradeSubjects}개</span>
                    <button class="view-detail-btn" data-student-id="${student.number}">상세 보기</button>
                </div>
            `;
            
            studentsGrid.appendChild(studentCard);
        });

        container.appendChild(studentsGrid);

        // 카드 내 상세 보기 버튼 클릭 처리 (이벤트 위임)
        studentsGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-detail-btn');
            if (!btn) return;
            const studentId = btn.getAttribute('data-student-id');
            if (!studentId) return;

            // 선택 박스 동기화 (선택되어 있다면)
            const studentSelect = document.getElementById('studentSelect');
            if (studentSelect) {
                studentSelect.value = studentId;
            }

            const targetStudent = this.combinedData.students.find(s => s.number == studentId);
            if (!targetStudent) return;

            this.renderStudentDetail(targetStudent);
            this.switchView('detail');
        });
    }

    filterStudentTable() {
        if (!this.combinedData) return;

        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentNameSearch = document.getElementById('studentNameSearch');

        const selectedGrade = gradeSelect ? gradeSelect.value : '';
        const selectedClass = classSelect ? classSelect.value : '';
        const searchTerm = studentNameSearch ? studentNameSearch.value.trim().toLowerCase() : '';

        // 학년/반/검색어로 필터링
        let filtered = this.combinedData.students;

        if (selectedGrade) {
            filtered = filtered.filter(s => String(s.grade) === String(selectedGrade));
        }

        if (selectedClass) {
            filtered = filtered.filter(s => String(s.class) === String(selectedClass));
        }

        if (searchTerm) {
            filtered = filtered.filter(s =>
                s.number.toString().includes(searchTerm) ||
                s.name.toLowerCase().includes(searchTerm) ||
                (s.originalNumber && String(s.originalNumber).includes(searchTerm))
            );
        }

        // Apply sort
        if (this._sortColumn) {
            filtered = this._sortStudents(filtered);
        }

        // 테이블 다시 렌더링
        const container = document.getElementById('studentTable');
        if (container) {
            this.renderStudentTable(filtered, this.combinedData.subjects, container);
        }
    }

    _sortStudents(students) {
        const col = this._sortColumn;
        const asc = this._sortAsc;
        return [...students].sort((a, b) => {
            let va, vb;
            if (col === 'name') {
                va = a.name || ''; vb = b.name || '';
                return asc ? va.localeCompare(vb) : vb.localeCompare(va);
            } else if (col === 'number') {
                va = a.originalNumber || 0; vb = b.originalNumber || 0;
            } else if (col === 'avgGrade') {
                va = a.weightedAverageGrade || 999; vb = b.weightedAverageGrade || 999;
            } else if (col === 'rank') {
                va = a.averageGradeRank || 999; vb = b.averageGradeRank || 999;
            } else {
                return 0;
            }
            return asc ? va - vb : vb - va;
        });
    }

    _toggleSort(column) {
        if (this._sortColumn === column) {
            this._sortAsc = !this._sortAsc;
        } else {
            this._sortColumn = column;
            this._sortAsc = true;
        }
        this.filterStudentTable();
    }

    switchTab(tabName) {
        // 탭 버튼 활성화 + ARIA
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // 탭 내용 표시
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // URL hash 업데이트
        if (history.replaceState) {
            history.replaceState(null, '', '#' + tabName);
        }
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
        
        // 기존 학급 전체 인쇄 영역 완전 제거
        const classPrintArea = document.getElementById('classPrintArea');
        if (classPrintArea) {
            classPrintArea.remove();
        }
        
        // 학급 전체 인쇄 관련 클래스 제거
        const studentsTab = document.getElementById('students-tab');
        if (studentsTab) {
            studentsTab.classList.remove('only-class-print', 'print-target');
        }
        
        // 학점 가중 평균 백분위 계산
        const weightedAveragePercentile = this.calculateWeightedAveragePercentile(student, this.combinedData.subjects);
        
        // 평균등급 기준 순위
        const averageGradeRank = student.averageGradeRank;
        const sameGradeCount = student.sameGradeCount;
        const totalGradedStudents = student.totalGradedStudents;
        const studentSelect = document.getElementById('studentSelect');
        if (studentSelect) {
            studentSelect.value = student.number;
        }

        const filteredStudents = this.getStudentDetailNavigationStudents();
        const navigationStudents = filteredStudents.some(s => String(s.number) === String(student.number))
            ? filteredStudents
            : [student];
        const navigationIndex = navigationStudents.findIndex(s => String(s.number) === String(student.number));
        const hasPrevStudent = navigationIndex > 0;
        const hasNextStudent = navigationIndex >= 0 && navigationIndex < navigationStudents.length - 1;
        const navigationLabel = navigationStudents.length > 0 && navigationIndex >= 0
            ? `${navigationIndex + 1} / ${navigationStudents.length}`
            : '';
        const html = `
            <div class="print-controls">
                <div class="student-nav-controls">
                    <button class="detail-btn student-nav-btn" data-nav-offset="-1" ${hasPrevStudent ? '' : 'disabled'}>이전 학생</button>
                    <span class="student-nav-status">${navigationLabel}</span>
                    <button class="detail-btn student-nav-btn" data-nav-offset="1" ${hasNextStudent ? '' : 'disabled'}>다음 학생</button>
                </div>
                <button class="pdf-btn" onclick="scoreAnalyzer.generatePDF('${student.name}')">PDF 저장</button>
            </div>
            
            <div id="printArea" class="print-area${this._showRankings ? '' : ' rankings-hidden'}">
                <div class="print-header" style="display: none;">
                    <h2>학생 성적 분석 보고서</h2>
                    <div class="print-date">생성일: ${new Date().toLocaleDateString('ko-KR')}</div>
                </div>
                
                <div class="student-detail-header">
                    <div class="student-info">
                        <h3>${student.name}</h3>
                        <div class="student-meta">
                            <span class="grade-class">${student.grade}학년 ${student.class}반 ${student.originalNumber}번</span>
                            ${student.fileName ? `<span class="file-info">출처: ${student.fileName}</span>` : ''}
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
                                        <span class="summary-label">평균등급</span>
                                        <span class="summary-value highlight">${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                                    </div>
                                    <div class="summary-item">
                                        <span class="summary-label">평균등급(9등급환산)</span>
                                        <span class="summary-value-group">
                                            ${this.renderNineGradeSummaryContent(student, this.combinedData.subjects)}
                                        </span>
                                    </div>
                                    <div class="summary-item ranking-visibility-target">
                                        <span class="summary-label">등급 순위</span>
                                        <span class="summary-value highlight">${averageGradeRank !== null && averageGradeRank !== undefined ? `${averageGradeRank}/${totalGradedStudents}위` + (sameGradeCount > 1 ? ` (${sameGradeCount}명)` : '') : 'N/A'}</span>
                                    </div>
                                    <div class="summary-item">
                                        <span class="summary-label">과목평균 백분위</span>
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
                            <h4>교과(군)별 평균등급</h4>
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
            </div>
        `;
        
        container.innerHTML = html;

        container.querySelectorAll('.student-nav-btn').forEach(button => {
            button.addEventListener('click', () => {
                const offset = parseInt(button.getAttribute('data-nav-offset'), 10);
                if (!isNaN(offset)) {
                    this.navigateStudentDetail(offset);
                }
            });
        });
        
        // 레이더 차트 생성
        setTimeout(() => {
            this.createStudentPercentileChart(student);
        }, 100);
    }

    // 학급 전체 인쇄용: 개별 학생과 완전히 동일한 HTML 구조
    buildStudentDetailHTMLForPrint(student, canvasId) {
        const weightedAveragePercentile = this.calculateWeightedAveragePercentile(student, this.combinedData.subjects);
        const averageGradeRank = student.averageGradeRank;
        const sameGradeCount = student.sameGradeCount;
        const totalGradedStudents = student.totalGradedStudents;
        return `
            <div class="student-print-page${this._showRankings ? '' : ' rankings-hidden'}">
                <div id="printArea-${canvasId}" class="print-area${this._showRankings ? '' : ' rankings-hidden'}">
                    <div class="print-header" style="display: none;">
                        <h2>학생 성적 분석 보고서</h2>
                        <div class="print-date">생성일: ${new Date().toLocaleDateString('ko-KR')}</div>
                    </div>
                    
                    <div class="student-detail-header">
                        <div class="student-info">
                            <h3>${student.name}</h3>
                            <div class="student-meta">
                                <span class="grade-class">${student.grade}학년 ${student.class}반 ${student.originalNumber}번</span>
                                ${student.fileName ? `<span class="file-info">출처: ${student.fileName}</span>` : ''}
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
                                            <span class="summary-label">평균등급</span>
                                            <span class="summary-value highlight">${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                                        </div>
                                        <div class="summary-item">
                                            <span class="summary-label">평균등급(9등급환산)</span>
                                            <span class="summary-value-group">
                                                ${this.renderNineGradeSummaryContent(student, this.combinedData.subjects)}
                                            </span>
                                        </div>
                                        <div class="summary-item ranking-visibility-target">
                                            <span class="summary-label">등급 순위</span>
                                            <span class="summary-value highlight">${averageGradeRank !== null && averageGradeRank !== undefined ? `${averageGradeRank}/${totalGradedStudents}위` + (sameGradeCount > 1 ? ` (${sameGradeCount}명)` : '') : 'N/A'}</span>
                                        </div>
                                        <div class="summary-item">
                                            <span class="summary-label">과목평균 백분위</span>
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
                                <h4>교과(군)별 평균등급</h4>
                                <canvas id="${canvasId}" width="400" height="400"></canvas>
                            </div>
                        </div>
                        
                        <div class="subject-details">
                            <h4>과목별 상세 분석</h4>
                            <div class="subject-cards">
                                ${this.renderSubjectCards(student)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 다중 생성용 차트 (교과군별 - PDF용)
    createStudentPercentileChartFor(canvas, student) {
        if (!canvas) return null;

        // 교과군별 평균 등급 계산
        const groupGrades = this.calculateGroupGrades(student);
        if (Object.keys(groupGrades).length === 0) return null;

        // order 순으로 정렬
        const sortedGroups = Object.entries(groupGrades)
            .sort((a, b) => a[1].order - b[1].order);

        const labels = sortedGroups.map(([name]) => name);
        const gradeData = sortedGroups.map(([name, data]) => 6 - data.averageGrade);
        const colors = sortedGroups.map(([name, data]) => data.color);
        const originalGrades = sortedGroups.map(([name, data]) => data.averageGrade);
        const getPlacement = (dataIndex) => this.getRadarLabelPlacement(dataIndex, labels.length, gradeData[dataIndex]);

        // 기존 차트 인스턴스가 해당 캔버스에 남아있다면 파괴
        try {
            const existing = (Chart.getChart ? Chart.getChart(canvas) : (canvas && (canvas._chart || canvas.chart)));
            if (existing && typeof existing.destroy === 'function') existing.destroy();
        } catch (_) {}

        return new Chart(canvas, {
            type: 'radar',
            plugins: [ChartDataLabels],
            data: {
                labels,
                datasets: [{
                    label: '교과군별 평균등급',
                    data: gradeData,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: colors,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                layout: {
                    padding: {
                        top: 16,
                        right: 10,
                        bottom: 10,
                        left: 10
                    }
                },
                animation: {
                    duration: 0
                },
                interaction: {
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    },
                    datalabels: {
                        display: true,
                        formatter: function(value, context) {
                            const idx = context.dataIndex;
                            return originalGrades[idx].toFixed(2) + '등급';
                        },
                        color: '#2c3e50',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        borderColor: function(context) {
                            return colors[context.dataIndex];
                        },
                        borderWidth: 2,
                        borderRadius: 6,
                        padding: {
                            top: 6,
                            bottom: 6,
                            left: 8,
                            right: 8
                        },
                        font: {
                            size: 11,
                            weight: 'bold'
                        },
                        anchor: 'center',
                        align: (context) => getPlacement(context.dataIndex).align,
                        offset: (context) => getPlacement(context.dataIndex).offset,
                        clamp: true,
                        textAlign: 'center'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 5,
                        min: 0,
                        ticks: {
                            stepSize: 1,
                            color: '#5a6c7d',
                            callback: function(value) {
                                if (value === 0) return '';
                                return `${6 - value}등급`;
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        pointLabels: {
                            font: {
                                size: 13,
                                weight: '600'
                            },
                            padding: 10,
                            color: function(context) {
                                return colors[context.index] || '#2c3e50';
                            }
                        }
                    }
                }
            }
        });
    }


    // 학급 전체 PDF
    async generateSelectedClassPDF() {
        if (this._pdfGenerating) return; // 중복 클릭 방지
        this._pdfGenerating = true;
        const pdfBtn = document.getElementById('pdfClassBtn');
        const prevBtnHTML = pdfBtn ? pdfBtn.innerHTML : '';
        if (pdfBtn) {
            pdfBtn.disabled = true;
            pdfBtn.innerText = '학급 PDF 생성 중...';
        }
        this.showPdfOverlay();
        // 필요 변수는 try 외부에 선언하여 예외 처리에서 접근 가능하도록 함
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const grade = gradeSelect.value;
        const cls = classSelect.value;
        let students = [];
        try {
            if (!grade || !cls) {
                this.showToast('학년과 반을 선택해 주세요.', 'warning');
                return;
            }
            students = this.combinedData.students.filter(s => String(s.grade) === String(grade) && String(s.class) === String(cls));
            if (students.length === 0) {
                this.showToast('선택한 학급의 학생이 없습니다.', 'warning');
                return;
            }

            const { jsPDF } = window.jspdf;
            // 메모리 사용을 줄이기 위해 압축 활성화
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            const pdfWidth = 210, pdfHeight = 297;
            const maxImgWidth = pdfWidth - 20; // 10mm 여백
            const maxImgHeight = pdfHeight - 20; // 상하 10mm 여백

            // 임시 캡처 컨테이너
            const temp = document.createElement('div');
            temp.style.position = 'fixed';
            temp.style.left = '-10000px';
            temp.style.top = '0';
            document.body.appendChild(temp);

            const total = students.length;
            for (let i = 0; i < students.length; i++) {
                const student = students[i];
                const canvasId = `pdfRadar-${student.grade}-${student.class}-${student.number}-${i}`;
                temp.innerHTML = this.buildStudentDetailHTMLForPrint(student, canvasId);
                // 차트 렌더
                await new Promise(r => setTimeout(r, 50));
                const canvas = document.getElementById(canvasId);
                const chartInstance = canvas ? this.createStudentPercentileChartFor(canvas, student) : null;
                await new Promise(r => setTimeout(r, 200));

                const element = temp.firstElementChild;
                // 캔버스 스케일을 낮추고 JPEG로 변환하여 용량 축소
                const canvasImg = await html2canvas(element, { scale: 1.3, backgroundColor: '#ffffff', useCORS: true, allowTaint: true });
                const imgData = canvasImg.toDataURL('image/jpeg', 0.82);
                const aspect = canvasImg.width / canvasImg.height;
                let drawWidth = maxImgWidth;
                let drawHeight = drawWidth / aspect;
                if (drawHeight > maxImgHeight) { drawHeight = maxImgHeight; drawWidth = drawHeight * aspect; }
                const x = (pdfWidth - drawWidth) / 2;
                const y = (pdfHeight - drawHeight) / 2;

                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', x, y, drawWidth, drawHeight);

                // 차트 메모리 해제
                if (chartInstance && typeof chartInstance.destroy === 'function') {
                    try { chartInstance.destroy(); } catch (_) {}
                }

                // 진행률 업데이트
                this.updatePdfProgress(i + 1, total);
            }

            document.body.removeChild(temp);
            const fileName = `${grade}학년_${cls}반_학생성적_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error('학급 전체 PDF 생성 오류:', err);
            // 문자열 길이 초과 등으로 실패하는 경우, 파일을 여러 개로 나눠 저장을 시도
            const isLenErr = err && (err.name === 'RangeError' || String(err.message || '').includes('Invalid string length'));
            if (isLenErr && students && students.length > 0) {
                try {
                    const chunkSize = 12; // 용량 방지를 위한 페이지 분할 크기
                    const totalParts = Math.ceil(students.length / chunkSize);
                    let processed = 0;
                    for (let part = 0; part < totalParts; part++) {
                        const start = part * chunkSize;
                        const end = Math.min(students.length, start + chunkSize);
                        const { jsPDF } = window.jspdf;
                        const partPdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
                        const pdfWidth = 210, pdfHeight = 297;
                        const maxImgWidth = pdfWidth - 20;
                        const maxImgHeight = pdfHeight - 20;

                        const temp = document.createElement('div');
                        temp.style.position = 'fixed';
                        temp.style.left = '-10000px';
                        temp.style.top = '0';
                        document.body.appendChild(temp);

                        for (let i = start; i < end; i++) {
                            const student = students[i];
                            const canvasId = `pdfRadar-${student.grade}-${student.class}-${student.number}-${i}`;
                            temp.innerHTML = this.buildStudentDetailHTMLForPrint(student, canvasId);
                            await new Promise(r => setTimeout(r, 50));
                            const canvas = document.getElementById(canvasId);
                            const chartInstance = canvas ? this.createStudentPercentileChartFor(canvas, student) : null;
                            await new Promise(r => setTimeout(r, 200));

                            const element = temp.firstElementChild;
                            const canvasImg = await html2canvas(element, { scale: 1.3, backgroundColor: '#ffffff', useCORS: true, allowTaint: true });
                            const imgData = canvasImg.toDataURL('image/jpeg', 0.82);
                            const aspect = canvasImg.width / canvasImg.height;
                            let drawWidth = maxImgWidth;
                            let drawHeight = drawWidth / aspect;
                            if (drawHeight > maxImgHeight) { drawHeight = maxImgHeight; drawWidth = drawHeight * aspect; }
                            const x = (pdfWidth - drawWidth) / 2;
                            const y = (pdfHeight - drawHeight) / 2;

                            if (i > start) partPdf.addPage();
                            partPdf.addImage(imgData, 'JPEG', x, y, drawWidth, drawHeight);

                            if (chartInstance && typeof chartInstance.destroy === 'function') {
                                try { chartInstance.destroy(); } catch (_) {}
                            }

                            // 진행률 업데이트 (분할 저장에서도 누적 기준)
                            processed += 1;
                            this.updatePdfProgress(processed, students.length);
                        }

                        document.body.removeChild(temp);
                        const partName = `${grade}학년_${cls}반_학생성적_${new Date().toISOString().split('T')[0]}_part${part + 1}-of-${totalParts}.pdf`;
                        partPdf.save(partName);
                    }
                    this.showToast('PDF가 용량 문제로 여러 개의 파일로 분할 저장되었습니다.', 'warning', 'PDF 분할 저장', 6000);
                    return;
                } catch (fallbackErr) {
                    console.error('분할 저장 시도 중 오류:', fallbackErr);
                }
            }
            this.showToast('학급 전체 PDF 생성 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error', 'PDF 오류', 6000);
        } finally {
            // UI 복구
            this.hidePdfOverlay();
            if (pdfBtn) {
                pdfBtn.disabled = false;
                pdfBtn.innerHTML = prevBtnHTML || '학급 전체 PDF';
            }
            this._pdfGenerating = false;
        }
    }

    showPdfOverlay() {
        try {
            let overlay = document.getElementById('pdfOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'pdfOverlay';
                overlay.style.position = 'fixed';
                overlay.style.left = '0';
                overlay.style.top = '0';
                overlay.style.right = '0';
                overlay.style.bottom = '0';
                overlay.style.background = 'rgba(255,255,255,0.65)';
                overlay.style.zIndex = '9999';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.innerHTML = '<div style="text-align:center;min-width:260px">\
<div class="spinner" style="margin:0 auto 12px auto"></div>\
<div id="pdfOverlayText" style="margin-bottom:10px">학급 PDF 생성 중...</div>\
<div style="height:10px;background:#e9ecef;border-radius:6px;overflow:hidden">\
  <div id="pdfOverlayBar" style="height:100%;width:0%;background:#4facfe;transition:width .2s ease"></div>\
</div>\
</div>';
                document.body.appendChild(overlay);
            } else {
                overlay.style.display = 'flex';
            }
        } catch (_) {}
    }

    hidePdfOverlay() {
        try {
            const overlay = document.getElementById('pdfOverlay');
            if (overlay) overlay.style.display = 'none';
        } catch (_) {}
    }

    updatePdfProgress(current, total) {
        try {
            const text = document.getElementById('pdfOverlayText');
            const bar = document.getElementById('pdfOverlayBar');
            if (text) text.textContent = `학급 PDF 생성 중... (${current}/${total})`;
            if (bar) {
                const pct = Math.max(0, Math.min(100, Math.round((current / Math.max(1,total)) * 100)));
                bar.style.width = pct + '%';
            }
        } catch (_) {}
    }

    renderSubjectCards(student) {
        // 과목을 교과군별로 그룹화
        const groupedSubjects = {};
        const groupOrder = this.subjectGroups?.groups || {};

        this.combinedData.subjects.forEach(subject => {
            if (!this.hasStudentSubjectData(student, subject.name)) {
                return;
            }

            const groupName = this.getSubjectGroup(subject.name, subject.sourceGroup);
            if (!groupedSubjects[groupName]) {
                groupedSubjects[groupName] = {
                    subjects: [],
                    order: groupOrder[groupName]?.order || 99,
                    color: groupOrder[groupName]?.color || '#95a5a6'
                };
            }
            groupedSubjects[groupName].subjects.push(subject);
        });

        // 교과군 순서대로 정렬
        const sortedGroups = Object.entries(groupedSubjects)
            .sort((a, b) => a[1].order - b[1].order);

        if (sortedGroups.length === 0) {
            return '<p>표시할 과목 데이터가 없습니다.</p>';
        }

        // 교과군별로 테이블 생성
        return sortedGroups.map(([groupName, groupData]) => {
            const subjectRows = groupData.subjects.map(subject => {
                return this.renderSubjectTableRow(student, subject);
            }).join('');

            return `
                <div class="subject-group-section compact">
                    <div class="subject-group-header" style="border-left: 4px solid ${groupData.color}">
                        <h5>${groupName}</h5>
                        <span class="subject-count">${groupData.subjects.length}과목</span>
                    </div>
                    <table class="subject-table">
                        <thead>
                            <tr>
                                <th>과목</th>
                                <th>학점</th>
                                <th>원점수(평균)</th>
                                <th>성취도</th>
                                <th>등급</th>
                                <th class="rank-column ranking-visibility-target">석차</th>
                                <th>백분위</th>
                                <th>9등급</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subjectRows}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    }

    hasStudentSubjectData(student, subjectName) {
        const hasOwn = (obj) => obj && Object.prototype.hasOwnProperty.call(obj, subjectName);
        return hasOwn(student.scores) ||
            hasOwn(student.achievements) ||
            hasOwn(student.grades) ||
            hasOwn(student.ranks) ||
            hasOwn(student.subjectTotals) ||
            hasOwn(student.percentiles);
    }

    // 개별 과목 테이블 행 렌더링
    renderSubjectTableRow(student, subject) {
        const hasScore = student.scores && Object.prototype.hasOwnProperty.call(student.scores, subject.name);
        const score = hasScore ? student.scores[subject.name] : null;
        const achievement = student.achievements && Object.prototype.hasOwnProperty.call(student.achievements, subject.name)
            ? student.achievements[subject.name]
            : '-';
        const grade = student.grades && Object.prototype.hasOwnProperty.call(student.grades, subject.name)
            ? student.grades[subject.name]
            : undefined;
        const rank = student.ranks && Object.prototype.hasOwnProperty.call(student.ranks, subject.name)
            ? student.ranks[subject.name]
            : '-';
        const percentile = student.percentiles && Object.prototype.hasOwnProperty.call(student.percentiles, subject.name)
            ? student.percentiles[subject.name]
            : null;

        const hasGrade = grade !== undefined && grade !== null && grade !== 'N/A' && !isNaN(grade);

        let percentileClass = 'low';
        if (hasGrade && percentile !== null && percentile >= 80) percentileClass = 'excellent';
        else if (hasGrade && percentile !== null && percentile >= 60) percentileClass = 'good';
        else if (hasGrade && percentile !== null && percentile >= 40) percentileClass = 'average';

        const grade9 = percentile !== null ? this.convertPercentileTo9Grade(percentile) : null;

        return `
            <tr class="${hasGrade ? '' : 'no-grade-row'}">
                <td class="subject-name-cell">${subject.name}</td>
                <td class="center">${subject.credits}</td>
                <td class="center">
                    <span class="score-value">${score !== null && score !== undefined ? score : '-'}</span>
                    <span class="avg-value">(${subject.average ? subject.average.toFixed(1) : '-'})</span>
                </td>
                <td class="center"><span class="achievement-badge ${achievement}">${achievement}</span></td>
                <td class="center">${hasGrade ? grade : '-'}</td>
                <td class="center rank-column ranking-visibility-target">${rank}</td>
                <td class="center"><span class="percentile ${percentileClass}">${percentile !== null ? percentile + '%' : '-'}</span></td>
                <td class="center"><span class="${grade9 ? 'grade9-value' : ''}">${grade9 || '-'}</span></td>
            </tr>
        `;
    }

    createStudentPercentileChart(student) {
        const ctx = document.getElementById('studentPercentileChart');
        if (!ctx) return;

        // 기존 차트 제거
        if (this.studentPercentileChart) {
            this.studentPercentileChart.destroy();
        }

        // 교과군별 평균 등급 계산
        const groupGrades = this.calculateGroupGrades(student);

        // 데이터가 없으면 차트 숨김
        if (Object.keys(groupGrades).length === 0) {
            ctx.parentElement.style.display = 'none';
            return;
        }

        ctx.parentElement.style.display = 'block';

        // order 순으로 정렬
        const sortedGroups = Object.entries(groupGrades)
            .sort((a, b) => a[1].order - b[1].order);

        const labels = sortedGroups.map(([name, data]) => name);
        const gradeData = sortedGroups.map(([name, data]) => {
            // 등급을 역순으로 변환 (1등급=5, 2등급=4, ..., 5등급=1)하여 차트에서 높게 표시
            return 6 - data.averageGrade;
        });
        const colors = sortedGroups.map(([name, data]) => data.color);
        const originalGrades = sortedGroups.map(([name, data]) => data.averageGrade);
        const subjectDetails = sortedGroups.map(([name, data]) => data.subjects);
        const getPlacement = (dataIndex) => this.getRadarLabelPlacement(dataIndex, labels.length, gradeData[dataIndex]);

        this.studentPercentileChart = new Chart(ctx, {
            type: 'radar',
            plugins: [ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label: '교과군별 평균등급',
                    data: gradeData,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: colors,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 16,
                        right: 10,
                        bottom: 10,
                        left: 10
                    }
                },
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
                            title: function(context) {
                                return context[0].label + ' 교과(군)';
                            },
                            label: function(context) {
                                const idx = context.dataIndex;
                                const avgGrade = originalGrades[idx];
                                return `평균 등급: ${avgGrade.toFixed(2)}등급`;
                            },
                            afterLabel: function(context) {
                                const idx = context.dataIndex;
                                const subjects = subjectDetails[idx];
                                if (subjects && subjects.length > 0) {
                                    const lines = ['포함 과목:'];
                                    subjects.forEach(s => {
                                        lines.push(`  ${s.name}: ${s.grade}등급 (${s.credits}학점)`);
                                    });
                                    return lines;
                                }
                                return '';
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        color: '#2c3e50',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        borderColor: function(context) {
                            return colors[context.dataIndex];
                        },
                        borderWidth: 2,
                        borderRadius: 6,
                        padding: {
                            top: 6,
                            bottom: 6,
                            left: 8,
                            right: 8
                        },
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        formatter: function(value, context) {
                            const idx = context.dataIndex;
                            return originalGrades[idx].toFixed(2) + '등급';
                        },
                        anchor: 'center',
                        align: (context) => getPlacement(context.dataIndex).align,
                        offset: (context) => getPlacement(context.dataIndex).offset,
                        clamp: true,
                        textAlign: 'center'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 5,
                        min: 0,
                        ticks: {
                            stepSize: 1,
                            font: {
                                size: 12
                            },
                            color: '#5a6c7d',
                            callback: function(value) {
                                // 역순으로 표시 (5가 1등급, 1이 5등급)
                                if (value === 0) return '';
                                return `${6 - value}등급`;
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        pointLabels: {
                            font: {
                                size: 14,
                                weight: '600'
                            },
                            padding: 10,
                            color: function(context) {
                                return colors[context.index] || '#2c3e50';
                            }
                        }
                    }
                }
            }
        });
    }

    // 프린터 출력 기능은 비활성화되었습니다.

    // PDF 생성 기능
    async generatePDF(studentName) {
        try {
            // 인쇄 전용 클래스 설정
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('print-target');
            });
            document.getElementById('students-tab').classList.add('print-target');
            
            // 잠시 기다려 레이아웃 적용
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            // PDF에 포함할 요소 선택 (차트 제외)
            const element = document.getElementById('printArea');
            if (!element) {
                this.showToast('PDF 생성할 내용을 찾을 수 없습니다.', 'error');
                return;
            }

            // html2canvas로 요소를 캡처
            const canvas = await html2canvas(element, {
                scale: 2,
                backgroundColor: '#ffffff',
                width: element.scrollWidth,
                height: element.scrollHeight,
                useCORS: true,
                allowTaint: true
            });

            const imgData = canvas.toDataURL('image/png');
            
            // PDF 크기 계산 (한 페이지에 맞춤)
            const pdfWidth = 210; // A4 width in mm
            const pdfHeight = 297; // A4 height in mm
            const maxImgWidth = pdfWidth - 20;  // 좌우 여백 합 20mm
            const maxImgHeight = pdfHeight - 60; // 상단 제목/정보 여백 60mm
            const imgAspect = canvas.width / canvas.height;
            let drawWidth = maxImgWidth;
            let drawHeight = drawWidth / imgAspect;
            if (drawHeight > maxImgHeight) {
                drawHeight = maxImgHeight;
                drawWidth = drawHeight * imgAspect;
            }

            // 이미지가 한 페이지에 들어가는지 확인
            // 한 페이지에 맞춰 중앙 정렬하여 배치 (상하 여백 10mm 기준)
            const x = (pdfWidth - drawWidth) / 2;
            const y = 10 + (maxImgHeight - drawHeight) / 2;
            pdf.addImage(imgData, 'PNG', x, y, drawWidth, drawHeight);

            // PDF 다운로드
            const fileName = `${studentName}_성적분석_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(fileName);

        } catch (error) {
            console.error('PDF 생성 중 오류:', error);
            this.showToast('PDF 생성 중 오류가 발생했습니다: ' + error.message, 'error', 'PDF 오류');
        }
    }


    showLoading() {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        // Reset progress bar
        const bar = document.getElementById('loadingProgressBar');
        const text = document.getElementById('loadingProgressText');
        const loadingText = document.getElementById('loadingText');
        if (bar) bar.style.width = '0%';
        if (text) text.textContent = '';
        if (loadingText) loadingText.textContent = '분석 중...';
        this.hideError();
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.innerHTML = `<span>${message}</span><button class="error-close-btn" onclick="this.parentElement.style.display='none'">&times;</button>`;
        errorDiv.style.display = 'flex';
        // Auto-dismiss after 8 seconds
        clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => { errorDiv.style.display = 'none'; }, 8000);
    }

    hideError() {
        const errorDiv = document.getElementById('error');
        errorDiv.style.display = 'none';
        clearTimeout(this._errorTimer);
    }

    // ========== Toast Notification System ==========
    showToast(message, type = 'info', title = '', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const icons = { success: '\u2705', error: '\u274C', warning: '\u26A0\uFE0F', info: '\u2139\uFE0F' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <div class="toast-body">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="닫기">&times;</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.classList.add('removing');
                    setTimeout(() => toast.remove(), 300);
                }
            }, duration);
        }
    }

    // ========== In-App Help Modal ==========
    showHelpModal() {
        const existing = document.getElementById('helpModalOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'helpModalOverlay';
        overlay.className = 'help-modal-overlay';
        overlay.innerHTML = `
            <div class="help-modal">
                <h3>사용 안내</h3>
                <div class="help-section">
                    <h4>1. 파일 업로드</h4>
                    <p>NEIS에서 <strong>XLS data</strong> 양식으로 다운로드한 파일을 업로드합니다. 여러 파일을 동시에 선택하거나 드래그하여 업로드할 수 있습니다.</p>
                </div>
                <div class="help-section">
                    <h4>2. 분석 결과 확인</h4>
                    <ol>
                        <li><strong>과목별 분석</strong>: 과목별 평균 점수와 등급 분포를 확인합니다.</li>
                        <li><strong>평균등급 분포</strong>: 전체 학생의 평균등급 분포를 차트로 확인합니다.</li>
                        <li><strong>학생별 분석</strong>: 개별 학생의 상세 성적을 확인하고 PDF로 저장합니다.</li>
                    </ol>
                </div>
                <div class="help-section">
                    <h4>3. 내보내기</h4>
                    <p><strong>취합용 DB 파일</strong>: 전체 학생 데이터를 CSV 파일로 저장합니다.<br>
                    <strong>분석결과 HTML</strong>: 현재 분석 결과를 독립형 HTML 파일로 저장합니다.<br>
                    <strong>PDF 저장</strong>: 개별 학생 또는 학급 전체 보고서를 PDF로 저장합니다.</p>
                </div>
                <div class="help-section">
                    <h4>보안</h4>
                    <p>모든 데이터는 브라우저에서만 처리되며, 서버로 전송되지 않습니다.</p>
                </div>
                <button class="help-close-btn">닫기</button>
            </div>
        `;

        overlay.querySelector('.help-close-btn').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    exportToCSV() {
        if (!this.combinedData || !this.combinedData.students || this.combinedData.students.length === 0) {
            this.showError('분석된 학생 데이터가 없습니다. 먼저 분석을 진행해주세요.');
            return;
        }

        // 개인정보 포함 여부를 묻는 모달 표시
        this.showExportOptionsModal();
    }

    showExportOptionsModal() {
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('exportOptionsModal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'exportOptionsModal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 10000;
        `;
        modal.innerHTML = `
            <div style="background: var(--bg-card, #fff); padding: 30px; border-radius: 16px;
                        max-width: 400px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                <h3 style="margin: 0 0 20px 0; color: var(--text-primary, #333); font-size: 1.2rem;">
                    취합용 DB 파일 생성
                </h3>
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;
                                  padding: 12px; background: var(--neutral-100, #f5f5f5);
                                  border-radius: 8px; user-select: none;">
                        <input type="checkbox" id="removePersonalInfo" checked
                               style="width: 18px; height: 18px; cursor: pointer;">
                        <span style="color: var(--text-primary, #333);">
                            개인정보 제외 (학번, 이름 삭제)
                        </span>
                    </label>
                    <p style="margin: 10px 0 0 0; font-size: 0.85rem; color: var(--text-muted, #888);">
                        체크 해제 시 A열: 학번, B열: 이름이 포함됩니다.
                    </p>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancelExport" style="padding: 10px 20px; border: 1px solid var(--neutral-300, #ddd);
                            background: var(--bg-card, #fff); border-radius: 8px; cursor: pointer;
                            color: var(--text-secondary, #666);">
                        취소
                    </button>
                    <button id="confirmExport" style="padding: 10px 20px; border: none;
                            background: linear-gradient(135deg, var(--primary, #8B2942), var(--primary-dark, #6B1D32));
                            color: white; border-radius: 8px; cursor: pointer; font-weight: 500;">
                        CSV 다운로드
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 이벤트 리스너
        document.getElementById('cancelExport').addEventListener('click', () => modal.remove());
        document.getElementById('confirmExport').addEventListener('click', () => {
            const removePersonalInfo = document.getElementById('removePersonalInfo').checked;
            modal.remove();
            this.generateCSV(removePersonalInfo);
        });

        // 모달 바깥 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    generateCSV(removePersonalInfo) {
        try {
            const subjects = this.combinedData.subjects;
            const groupOrder = this.subjectGroups?.groups || {};

            // 교과군 목록 추출 (순서대로)
            const subjectGroups = {};
            subjects.forEach(subject => {
                const groupName = this.getSubjectGroup(subject.name, subject.sourceGroup);
                if (!subjectGroups[groupName]) {
                    subjectGroups[groupName] = {
                        subjects: [],
                        order: groupOrder[groupName]?.order || 99
                    };
                }
                subjectGroups[groupName].subjects.push(subject);
            });
            const sortedGroupNames = Object.entries(subjectGroups)
                .sort((a, b) => a[1].order - b[1].order)
                .map(([name]) => name);

            // CSV 헤더 생성
            const headers = [];

            // 개인정보 열 (옵션)
            if (!removePersonalInfo) {
                headers.push('학번', '이름');
            }

            // 평균등급
            headers.push('평균등급(5등급)', '평균등급(9등급)');

            // 과목별 등급 (5등급)
            subjects.forEach(subject => {
                headers.push(this.getSubjectColumnLabel(subject));
            });

            // 교과군별 평균등급
            sortedGroupNames.forEach(groupName => {
                headers.push(`[${groupName}]평균`);
            });

            // 학생 데이터 정렬 (평균등급 오름차순)
            const sortedStudents = [...this.combinedData.students].sort((a, b) => {
                const gradeA = a.weightedAverageGrade || 999;
                const gradeB = b.weightedAverageGrade || 999;
                return gradeA - gradeB;
            });

            // CSV 데이터 생성
            const csvData = [headers];

            sortedStudents.forEach(student => {
                const row = [];

                // 개인정보 (옵션)
                if (!removePersonalInfo) {
                    const studentId = `${student.grade}${String(student.class).padStart(2, '0')}${String(student.originalNumber || student.number).padStart(2, '0')}`;
                    row.push(studentId, student.name || '');
                }

                // 평균등급 (5등급, 9등급)
                const weightedAverage9GradeDisplay = this.formatWeightedAverage9GradeDisplay(student, subjects);
                row.push(
                    student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : '',
                    weightedAverage9GradeDisplay === 'N/A' ? '' : weightedAverage9GradeDisplay
                );

                // 과목별 등급 (5등급)
                subjects.forEach(subject => {
                    const grade = student.grades ? student.grades[subject.name] : '';
                    row.push(grade || '');
                });

                // 교과군별 평균등급 계산
                sortedGroupNames.forEach(groupName => {
                    const groupSubjects = subjectGroups[groupName].subjects;
                    let totalGrade = 0;
                    let totalCredits = 0;

                    groupSubjects.forEach(subject => {
                        const grade = student.grades ? student.grades[subject.name] : null;
                        if (grade && !isNaN(grade)) {
                            totalGrade += grade * (subject.credits || 1);
                            totalCredits += (subject.credits || 1);
                        }
                    });

                    const avgGrade = totalCredits > 0 ? (totalGrade / totalCredits).toFixed(2) : '';
                    row.push(avgGrade);
                });

                csvData.push(row);
            });

            // CSV 문자열로 변환
            const csvContent = csvData.map(row =>
                row.map(field => {
                    if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
                        return '"' + field.replace(/"/g, '""') + '"';
                    }
                    return field;
                }).join(',')
            ).join('\n');

            // BOM을 추가하여 한글이 제대로 표시되도록 함
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

            // 파일 다운로드
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);

            const now = new Date();
            const dateStr = now.getFullYear() +
                           String(now.getMonth() + 1).padStart(2, '0') +
                           String(now.getDate()).padStart(2, '0') + '_' +
                           String(now.getHours()).padStart(2, '0') +
                           String(now.getMinutes()).padStart(2, '0');

            link.setAttribute('download', `학생성적_취합DB_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log(`CSV 파일이 생성되었습니다. 총 ${this.combinedData.students.length}명의 학생 데이터가 포함됩니다.`);

        } catch (error) {
            this.showError('CSV 파일 생성 중 오류가 발생했습니다: ' + error.message);
            console.error('CSV export error:', error);
        }
    }

    // 5등급을 9등급으로 환산하는 메소드
    convertTo9Grade(grade5) {
        if (!grade5 || grade5 < 1 || grade5 > 5) return '';
        
        // 5등급 → 9등급 환산표
        const conversionTable = {
            1: [1, 2],      // 1등급 → 1,2등급
            2: [3, 4],      // 2등급 → 3,4등급  
            3: [5, 6],      // 3등급 → 5,6등급
            4: [7, 8],      // 4등급 → 7,8등급
            5: [9]          // 5등급 → 9등급
        };
        
        const range = conversionTable[grade5];
        if (!range) return '';
        
        // 범위의 중간값 반환 (예: [1,2] → 1.5, [9] → 9)
        if (range.length === 1) {
            return range[0];
        } else {
            return (range[0] + range[1]) / 2;
        }
    }

    // 독립형 HTML 파일로 내보내기
    showHtmlExportOptionsModal() {
        const existingModal = document.getElementById('htmlExportOptionsModal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'htmlExportOptionsModal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 10000;
        `;
        modal.innerHTML = `
            <div style="background: var(--bg-card, #fff); padding: 30px; border-radius: 16px;
                        max-width: 440px; width: 92%; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                <h3 style="margin: 0 0 18px 0; color: var(--text-primary, #333); font-size: 1.2rem;">
                    분석결과 HTML 저장
                </h3>
                <p style="margin: 0 0 14px 0; color: var(--text-secondary, #666); line-height: 1.5; font-size: 0.92rem;">
                    열기 암호를 설정하면 저장 파일을 열 때 먼저 암호를 입력해야 합니다.
                    비워두면 기존처럼 암호 없이 저장됩니다.
                </p>
                <div style="display: grid; gap: 12px; margin-bottom: 10px;">
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 0.9rem; color: var(--text-primary, #333); font-weight: 600;">열기 암호</span>
                        <input type="password" id="htmlExportPassword" placeholder="선택 입력"
                               style="padding: 12px; border: 1px solid var(--neutral-300, #ddd); border-radius: 8px; font-size: 0.95rem;">
                    </label>
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 0.9rem; color: var(--text-primary, #333); font-weight: 600;">암호 확인</span>
                        <input type="password" id="htmlExportPasswordConfirm" placeholder="암호를 다시 입력"
                               style="padding: 12px; border: 1px solid var(--neutral-300, #ddd); border-radius: 8px; font-size: 0.95rem;">
                    </label>
                </div>
                <p style="margin: 0 0 18px 0; font-size: 0.82rem; color: var(--text-muted, #888); line-height: 1.5;">
                    이 기능은 최소한의 보호 장치입니다. 암호를 잊으면 저장 파일에서 데이터를 복구할 수 없습니다.
                </p>
                <div id="htmlExportOptionsError" style="min-height: 1.2em; margin-bottom: 12px; color: #c0392b; font-size: 0.85rem;"></div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancelHtmlExport" style="padding: 10px 20px; border: 1px solid var(--neutral-300, #ddd);
                            background: var(--bg-card, #fff); border-radius: 8px; cursor: pointer;
                            color: var(--text-secondary, #666);">
                        취소
                    </button>
                    <button id="confirmHtmlExport" style="padding: 10px 20px; border: none;
                            background: linear-gradient(135deg, var(--primary, #8B2942), var(--primary-dark, #6B1D32));
                            color: white; border-radius: 8px; cursor: pointer; font-weight: 500;">
                        HTML 다운로드
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const passwordInput = document.getElementById('htmlExportPassword');
        const confirmInput = document.getElementById('htmlExportPasswordConfirm');
        const errorDiv = document.getElementById('htmlExportOptionsError');
        const closeModal = () => modal.remove();

        document.getElementById('cancelHtmlExport').addEventListener('click', closeModal);
        document.getElementById('confirmHtmlExport').addEventListener('click', async () => {
            const password = passwordInput ? passwordInput.value : '';
            const passwordConfirm = confirmInput ? confirmInput.value : '';

            if ((password || passwordConfirm) && password !== passwordConfirm) {
                if (errorDiv) errorDiv.textContent = '암호와 확인 입력이 일치하지 않습니다.';
                if (confirmInput) confirmInput.focus();
                return;
            }

            closeModal();
            await this.exportAsStandaloneHtml({ password });
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        if (passwordInput) {
            setTimeout(() => passwordInput.focus(), 0);
        }
    }

    async exportAsStandaloneHtml(options = {}) {
        if (!this.combinedData) {
            this.showError('분석 데이터가 없습니다.');
            return;
        }

        try {
            // 현재 페이지의 HTML을 읽어서 독립형 버전 생성
            const htmlTemplate = await this.generateStandaloneHtmlTemplate(options);
            
            // BOM을 추가하여 한글이 제대로 표시되도록 함
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + htmlTemplate], { type: 'text/html;charset=utf-8;' });

            // 파일 다운로드
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            
            // 파일명 생성 (현재 날짜 포함)
            const now = new Date();
            const dateStr = now.getFullYear() + 
                           String(now.getMonth() + 1).padStart(2, '0') + 
                           String(now.getDate()).padStart(2, '0') + '_' +
                           String(now.getHours()).padStart(2, '0') + 
                           String(now.getMinutes()).padStart(2, '0');
            
            link.setAttribute('download', `index_${dateStr}.html`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log('독립형 HTML 파일이 생성되었습니다.');
            
        } catch (error) {
            this.showError('HTML 파일 생성 중 오류가 발생했습니다: ' + error.message);
            console.error('HTML export error:', error);
        }
    }

    getRuntimeScriptText() {
        try {
            if (typeof ScoreAnalyzer === 'function') {
                return `${ScoreAnalyzer.toString()}

let scoreAnalyzer;

document.addEventListener('DOMContentLoaded', () => {
    scoreAnalyzer = new ScoreAnalyzer();
});
`;
            }
        } catch (error) {
            console.warn('실행 중인 ScoreAnalyzer 소스 추출 실패:', error);
        }

        return '';
    }

    escapeInlineScriptContent(text) {
        if (!text) return '';
        return String(text).replace(/<\/script/gi, '<\\/script');
    }

    arrayBufferToBase64(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    async derivePasswordKey(password, salt, keyUsages) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('현재 브라우저는 암호 보호 HTML 저장을 지원하지 않습니다.');
        }

        const encoder = new TextEncoder();
        const baseKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 250000,
                hash: 'SHA-256'
            },
            baseKey,
            {
                name: 'AES-GCM',
                length: 256
            },
            false,
            keyUsages
        );
    }

    async encryptExportPayload(password, payload) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.derivePasswordKey(password, salt, ['encrypt']);
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv
            },
            key,
            encoder.encode(JSON.stringify(payload))
        );

        return {
            salt: this.arrayBufferToBase64(salt),
            iv: this.arrayBufferToBase64(iv),
            ciphertext: this.arrayBufferToBase64(ciphertext),
            iterations: 250000
        };
    }

    buildProtectedHtmlBootstrap(encryptedPayload) {
        return `
(() => {
    const encryptedPayload = ${JSON.stringify(encryptedPayload)};
    const LOCK_CLASS = 'protected-export-locked';
    window.APP_BUILD_UTC = new Date().toISOString();

    const style = document.createElement('style');
    style.textContent = \`
body.\${LOCK_CLASS} .container { visibility: hidden !important; }
#protectedExportOverlay {
    position: fixed;
    inset: 0;
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(8px);
}
#protectedExportOverlay .overlay-card {
    width: min(100%, 420px);
    background: #ffffff;
    border-radius: 20px;
    padding: 28px;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
    border: 1px solid rgba(15, 23, 42, 0.08);
}
#protectedExportOverlay h2 {
    margin: 0 0 10px 0;
    font-size: 1.25rem;
    color: #0f172a;
}
#protectedExportOverlay p {
    margin: 0 0 16px 0;
    color: #475569;
    line-height: 1.55;
    font-size: 0.93rem;
}
#protectedExportOverlay input {
    width: 100%;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    font-size: 1rem;
    margin-bottom: 12px;
    box-sizing: border-box;
}
#protectedExportOverlay button {
    width: 100%;
    border: none;
    border-radius: 10px;
    padding: 12px 14px;
    background: #10A37F;
    color: #ffffff;
    font-size: 0.98rem;
    font-weight: 600;
    cursor: pointer;
}
#protectedExportOverlay button:disabled {
    opacity: 0.6;
    cursor: wait;
}
#protectedExportStatus {
    min-height: 1.2em;
    margin-top: 12px;
    color: #b91c1c;
    font-size: 0.88rem;
}
\`;
    document.head.appendChild(style);
    document.body.classList.add(LOCK_CLASS);

    const overlay = document.createElement('div');
    overlay.id = 'protectedExportOverlay';
    overlay.innerHTML = \`
        <div class="overlay-card">
            <h2>암호 보호된 분석 결과</h2>
            <p>이 파일은 암호가 맞아야 분석 결과를 복호화해서 보여줍니다.</p>
            <input id="protectedExportPassword" type="password" placeholder="열기 암호 입력" autocomplete="current-password">
            <button id="protectedExportUnlock">열기</button>
            <div id="protectedExportStatus"></div>
        </div>
    \`;
    document.body.appendChild(overlay);

    const passwordInput = document.getElementById('protectedExportPassword');
    const unlockButton = document.getElementById('protectedExportUnlock');
    const statusEl = document.getElementById('protectedExportStatus');

    const base64ToBytes = (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    };

    const unlock = async () => {
        const password = passwordInput ? passwordInput.value : '';
        if (!password) {
            if (statusEl) statusEl.textContent = '암호를 입력하세요.';
            if (passwordInput) passwordInput.focus();
            return;
        }

        unlockButton.disabled = true;
        if (statusEl) statusEl.textContent = '암호 확인 중...';

        try {
            const salt = base64ToBytes(encryptedPayload.salt);
            const iv = base64ToBytes(encryptedPayload.iv);
            const ciphertext = base64ToBytes(encryptedPayload.ciphertext);
            const encoder = new TextEncoder();
            const baseKey = await crypto.subtle.importKey(
                'raw',
                encoder.encode(password),
                'PBKDF2',
                false,
                ['deriveKey']
            );
            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt,
                    iterations: encryptedPayload.iterations,
                    hash: 'SHA-256'
                },
                baseKey,
                {
                    name: 'AES-GCM',
                    length: 256
                },
                false,
                ['decrypt']
            );
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            const payload = JSON.parse(new TextDecoder().decode(decrypted));

            window.PRELOADED_DATA = payload.analysisData;
            window.PRELOADED_SUBJECT_GROUPS = payload.subjectGroups;
            window.PRELOADED_UI_STATE = payload.uiState;

            document.body.classList.remove(LOCK_CLASS);
            overlay.remove();

            const initializeDecryptedView = async () => {
                if (typeof scoreAnalyzer !== 'undefined' && scoreAnalyzer && typeof scoreAnalyzer.initializePreloadedView === 'function') {
                    scoreAnalyzer.subjectGroups = payload.subjectGroups || scoreAnalyzer.subjectGroups;
                    scoreAnalyzer.subjectGroupsReady = Promise.resolve(scoreAnalyzer.subjectGroups);
                    await scoreAnalyzer.initializePreloadedView();
                } else if (typeof ScoreAnalyzer === 'function') {
                    scoreAnalyzer = new ScoreAnalyzer();
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    initializeDecryptedView();
                }, { once: true });
            } else {
                await initializeDecryptedView();
            }
        } catch (error) {
            if (statusEl) statusEl.textContent = '암호가 올바르지 않거나 파일이 손상되었습니다.';
            if (passwordInput) {
                passwordInput.focus();
                passwordInput.select();
            }
        } finally {
            unlockButton.disabled = false;
        }
    };

    unlockButton.addEventListener('click', () => {
        unlock();
    });

    if (passwordInput) {
        passwordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                unlock();
            }
        });
        setTimeout(() => passwordInput.focus(), 0);
    }
})();
`;
    }

    // 독립형 HTML 템플릿 생성
    async generateStandaloneHtmlTemplate(options = {}) {
        const analysisData = JSON.stringify(this.combinedData);
        const subjectGroupsData = JSON.stringify(this.subjectGroups || null);
        const uiState = JSON.stringify(this.getCurrentUiState());
        const password = typeof options.password === 'string' ? options.password : '';

        // 원본 index.html, style.css, script.js를 그대로 사용하여 완전 동일한 구조로 생성
        const fetchText = async (url) => {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                return await res.text();
            } catch (e) {
                console.warn('리소스 로드 실패:', url, e);
                return '';
            }
        };

        const [indexHtml, jsText, xlsx, chart, datalabels, jszip, jspdf, html2canvas] = await Promise.all([
            fetchText('index.html'),
            fetchText('script.js'),
            fetchText('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'),
            fetchText('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js'),
            fetchText('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2'),
            fetchText('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'),
            fetchText('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
            fetchText('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
        ]);
        const cssText = await this.getStyleCSS();
        const runtimeJsText = (jsText && jsText.trim()) ? jsText : this.getRuntimeScriptText();

        // DOMParser로 원본 index.html을 파싱하여 안전하게 조작
        const htmlSource = document.documentElement?.outerHTML || indexHtml;
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlSource, 'text/html');

        // 1) style.css 링크 -> 인라인 <style>
        try {
            const link = doc.querySelector('link[href="style.css"]');
            if (link && cssText) {
                const styleEl = doc.createElement('style');
                styleEl.textContent = cssText;
                link.replaceWith(styleEl);
            }
        } catch (_) {}

        // 2) 외부 라이브러리 <script src=...> 인라인 치환
        const inlineMap = new Map([
            ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', xlsx],
            ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js', chart],
            ['https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2', datalabels],
            ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', jszip],
            ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', jspdf],
            ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', html2canvas]
        ]);

        doc.querySelectorAll('script[src]').forEach((s) => {
            const srcAttr = s.getAttribute('src');
            if (inlineMap.has(srcAttr) && inlineMap.get(srcAttr)) {
                const inline = doc.createElement('script');
                inline.textContent = this.escapeInlineScriptContent(inlineMap.get(srcAttr));
                s.replaceWith(inline);
            }
        });

        // 3) script.js 인라인 및 PRELOADED_DATA 주입
        try {
            const appScript = doc.querySelector('script[src="script.js"]');
            const preload = doc.createElement('script');
            let preloadScript = `window.APP_BUILD_UTC = new Date().toISOString();\nwindow.PRELOADED_DATA = ${analysisData};\nwindow.PRELOADED_SUBJECT_GROUPS = ${subjectGroupsData};\nwindow.PRELOADED_UI_STATE = ${uiState};`;
            if (password) {
                const encryptedPayload = await this.encryptExportPayload(password, {
                    analysisData: this.combinedData,
                    subjectGroups: this.subjectGroups || null,
                    uiState: this.getCurrentUiState()
                });
                preloadScript = this.buildProtectedHtmlBootstrap(encryptedPayload);
            }
            preload.textContent = this.escapeInlineScriptContent(preloadScript);
            const inline = doc.createElement('script');
            if (!runtimeJsText || !runtimeJsText.trim()) {
                console.warn('동작 스크립트를 확보하지 못해 현재 화면 스냅샷으로 저장합니다.');
                return await this.generateExactSnapshotHtmlTemplate();
            }
            inline.textContent = this.escapeInlineScriptContent(runtimeJsText);
            if (appScript) {
                appScript.replaceWith(preload);
                preload.after(inline);
            } else {
                doc.body.appendChild(preload);
                doc.body.appendChild(inline);
            }
        } catch (_) {}

        return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    }

    // CSS 파일 내용 가져오기 (style.css 우선, 실패 시 CSSOM, 최종 내장 CSS)
    async getStyleCSS() {
        // 1) style.css 직접 읽기 시도 (가장 확실하게 동일 스타일 보장)
        try {
            const res = await fetch('style.css', { cache: 'no-cache' });
            if (res && res.ok) {
                const text = await res.text();
                if (text && text.trim().length > 0) return text;
            }
        } catch (_) {
            // 무시하고 다음 방법 시도
        }

        // 2) CSSOM에서 style.css 규칙 추출 (일부 환경에서 보안 정책으로 실패할 수 있음)
        try {
            const styleSheets = document.styleSheets;
            let cssText = '';
            for (let i = 0; i < styleSheets.length; i++) {
                try {
                    const styleSheet = styleSheets[i];
                    if (styleSheet.href && styleSheet.href.includes('style.css')) {
                        const rules = styleSheet.cssRules || styleSheet.rules;
                        for (let j = 0; j < rules.length; j++) {
                            cssText += rules[j].cssText + '\n';
                        }
                    }
                } catch (_) {
                    // 접근 불가한 경우 넘어감
                    continue;
                }
            }
            if (cssText.trim()) return cssText;
        } catch (_) {
            // 넘어가서 내장 CSS 사용
        }

        // 3) 최종 Fallback: 내장 CSS
        console.warn('style.css를 읽지 못해 내장 CSS로 대체합니다.');
        return this.getBuiltInCSS();
    }

    // 내장 CSS 스타일
    getBuiltInCSS() {
        return "/* ========================================\n   Modern Clean Theme\n   ======================================== */\n\n:root {\n    --primary: #10A37F;\n    --primary-light: #14B88F;\n    --primary-dark: #0B7A5F;\n    --primary-bg: rgba(16, 163, 127, 0.08);\n\n    --accent: #0F766E;\n    --accent-light: #14B8A6;\n    --accent-muted: #CCFBF1;\n    --accent-bg: rgba(15, 118, 110, 0.08);\n\n    --neutral-50: #FCFDFE;\n    --neutral-100: #F8FAFC;\n    --neutral-200: #EEF2F6;\n    --neutral-300: #DCE3EA;\n    --neutral-400: #B6C0CC;\n    --neutral-500: #7A8797;\n    --neutral-600: #556171;\n    --neutral-700: #334155;\n    --neutral-800: #0F172A;\n\n    --success: #15803D;\n    --success-light: #16A34A;\n    --success-bg: rgba(21, 128, 61, 0.1);\n\n    --info: #2563EB;\n    --info-light: #3B82F6;\n    --info-bg: rgba(37, 99, 235, 0.1);\n\n    --warning: #D97706;\n    --warning-light: #F59E0B;\n    --warning-bg: rgba(217, 119, 6, 0.12);\n\n    --bg-body: radial-gradient(circle at top, #FFFFFF 0%, #F6F8FA 42%, #EEF2F6 100%);\n    --bg-card: #FFFFFF;\n    --bg-card-hover: #FFFFFF;\n    --bg-section: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%);\n\n    --text-primary: #0F172A;\n    --text-secondary: #475569;\n    --text-muted: #64748B;\n    --text-inverse: #FFFFFF;\n\n    --border-light: rgba(15, 23, 42, 0.08);\n    --border-medium: rgba(15, 23, 42, 0.14);\n    --border-accent: rgba(16, 163, 127, 0.18);\n\n    --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05);\n    --shadow-md: 0 8px 24px rgba(15, 23, 42, 0.06);\n    --shadow-lg: 0 16px 36px rgba(15, 23, 42, 0.08);\n    --shadow-xl: 0 24px 64px rgba(15, 23, 42, 0.1);\n\n    --radius-sm: 10px;\n    --radius-md: 14px;\n    --radius-lg: 20px;\n    --radius-xl: 28px;\n\n    --grade-1: #15803D;\n    --grade-2: #0F766E;\n    --grade-3: #0369A1;\n    --grade-4: #D97706;\n    --grade-5: #7A8797;\n}\n\n* {\n    margin: 0;\n    padding: 0;\n    box-sizing: border-box;\n}\n\nbody {\n    font-family: 'Pretendard Variable', 'Pretendard', 'SUIT Variable', 'Noto Sans KR', sans-serif;\n    background: var(--bg-body);\n    min-height: 100vh;\n    padding: 18px;\n    position: relative;\n    overflow-x: hidden;\n    color: var(--text-primary);\n}\n\n.container {\n    max-width: 1320px;\n    margin: 0 auto;\n    background: var(--bg-card);\n    border-radius: var(--radius-xl);\n    box-shadow: var(--shadow-xl);\n    overflow: hidden;\n    position: relative;\n    border: 1px solid var(--border-light);\n}\n\nheader {\n    background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%);\n    color: var(--text-primary);\n    padding: 28px 36px 24px;\n    text-align: left;\n    border-bottom: 1px solid var(--neutral-200);\n}\n\nheader h1 {\n    font-size: 2rem;\n    margin-bottom: 6px;\n    font-weight: 600;\n    letter-spacing: -0.04em;\n    position: relative;\n}\n\n.header-subtitle {\n    font-size: 1rem;\n    color: var(--text-secondary);\n    max-width: 720px;\n    line-height: 1.6;\n}\n\n.badge-lite {\n    display: inline-block;\n    margin-left: 10px;\n    padding: 4px 10px;\n    font-size: 0.74rem;\n    font-weight: 600;\n    color: var(--text-secondary);\n    background: var(--neutral-100);\n    border: 1px solid var(--neutral-300);\n    border-radius: 999px;\n    letter-spacing: 0.08em;\n    vertical-align: middle;\n    text-transform: uppercase;\n}\n\n.upload-section {\n    padding: 32px 36px;\n    text-align: center;\n    border-bottom: 1px solid var(--neutral-200);\n    position: relative;\n    background: linear-gradient(180deg, var(--neutral-50) 0%, var(--bg-card) 100%);\n}\n\n.container.post-analysis > header,\n.container.post-analysis .upload-guide,\n.container.post-analysis .section-divider,\n.container.post-analysis .file-input-wrapper,\n.container.post-analysis #fileList,\n.container.post-analysis #analyzeBtn {\n    display: none !important;\n}\n\n.file-input-wrapper {\n    margin-bottom: 30px;\n}\n\n.file-input-wrapper input[type=\"file\"] {\n    display: none;\n}\n\n.file-input-label {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    width: min(100%, 720px);\n    min-height: 88px;\n    margin: 0 auto;\n    padding: 18px 28px;\n    background: var(--bg-card);\n    border: 1.5px dashed var(--neutral-300);\n    border-radius: var(--radius-lg);\n    cursor: pointer;\n    transition: all 0.25s ease;\n    font-size: 1rem;\n    font-weight: 500;\n    color: var(--text-primary);\n}\n\n.upload-hint {\n    margin-top: 12px;\n    font-size: 0.9rem;\n    color: var(--text-muted);\n}\n\n.file-input-label:hover {\n    background: var(--neutral-50);\n    border-color: var(--primary);\n    color: var(--primary-dark);\n}\n\n.file-input-label.dragover {\n    background: var(--primary-bg);\n    border-color: var(--primary);\n    color: var(--primary);\n    box-shadow: 0 0 0 4px var(--primary-bg) inset;\n}\n\n/* 업로드 섹션 전체 드래그오버 강조 및 오버레이 안내 */\n.upload-section.dragover {\n    border: 1.5px dashed var(--primary);\n    border-radius: var(--radius-lg);\n    background: var(--primary-bg);\n}\n.upload-section.dragover::after {\n    content: '여기에 파일을 드롭하세요';\n    position: absolute;\n    left: 50%;\n    top: 50%;\n    transform: translate(-50%, -50%);\n    color: var(--primary);\n    font-weight: 600;\n    font-size: 1rem;\n    padding: 12px 18px;\n    background: var(--bg-card);\n    border: 1px solid var(--primary-light);\n    border-radius: var(--radius-sm);\n    pointer-events: none;\n    box-shadow: var(--shadow-lg);\n}\n\n.analyze-btn {\n    background: var(--primary);\n    color: var(--text-inverse);\n    border: 1px solid transparent;\n    padding: 12px 22px;\n    border-radius: 999px;\n    font-size: 0.95rem;\n    font-weight: 600;\n    cursor: pointer;\n    transition: all 0.25s ease;\n    box-shadow: none;\n}\n\n.analyze-btn:hover:not(:disabled) {\n    transform: translateY(-2px);\n    box-shadow: var(--shadow-md);\n    background: var(--primary-dark);\n}\n\n.analyze-btn:active:not(:disabled) {\n    transform: translateY(0);\n}\n\n.analyze-btn:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n    background: var(--neutral-400);\n    box-shadow: none;\n}\n\n.action-buttons {\n    display: flex;\n    justify-content: center;\n    gap: 10px;\n    flex-wrap: wrap;\n}\n\n.secondary-btn {\n    background: var(--bg-card);\n    color: var(--text-primary);\n    border-color: var(--neutral-300);\n}\n\n.secondary-btn:hover:not(:disabled) {\n    background: var(--neutral-100);\n    color: var(--text-primary);\n    box-shadow: var(--shadow-sm);\n}\n\n.export-btn {\n    background: var(--bg-card);\n    color: var(--primary);\n    border: 2px solid var(--primary);\n    padding: 13px 32px;\n    border-radius: var(--radius-lg);\n    font-size: 1rem;\n    cursor: pointer;\n    transition: all 0.25s ease;\n}\n\n.export-btn:hover:not(:disabled) {\n    background: var(--primary);\n    color: var(--text-inverse);\n    transform: translateY(-2px);\n    box-shadow: var(--shadow-lg);\n}\n\n.export-btn:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n}\n\n.upload-guide {\n    background: var(--bg-card);\n    border: 1px solid var(--neutral-200);\n    padding: 22px 24px;\n    margin: 0 auto 18px;\n    border-radius: var(--radius-lg);\n    box-shadow: var(--shadow-sm);\n    max-width: 920px;\n    text-align: left;\n}\n\n.upload-guide p {\n    margin: 0;\n    color: var(--text-secondary);\n    line-height: 1.6;\n}\n\n.guide-title {\n    color: var(--text-primary);\n    margin-bottom: 8px !important;\n    font-size: 1rem;\n    font-weight: 700;\n}\n\n.upload-guide strong {\n    color: var(--text-primary);\n}\n\n.section-divider {\n    height: 1px;\n    background: linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06));\n    margin: 16px 0 22px 0;\n    border: none;\n}\n\n.warning-text {\n    color: var(--warning);\n    font-weight: 600;\n    font-size: 0.95rem;\n    margin-top: 10px;\n    text-align: left;\n    padding: 8px 12px;\n    background-color: var(--warning-bg);\n    border-radius: var(--radius-md);\n    border-left: 4px solid var(--warning);\n}\n\n/* 강조 색상: XLS vs XLS data 구분 표시 */\n.warning-text .xls {\n    color: var(--warning);\n    background: rgba(217, 119, 6, 0.12);\n    padding: 2px 8px;\n    border-radius: 4px;\n    font-weight: 800;\n}\n.warning-text .xlsdata {\n    color: var(--success);\n    background: var(--success-bg);\n    padding: 2px 8px;\n    border-radius: 4px;\n    font-weight: 800;\n}\n\n.privacy-notice {\n    margin-top: 10px;\n    padding: 14px 16px;\n    border-radius: var(--radius-md);\n    background: var(--neutral-100);\n    border: 1px solid var(--neutral-200);\n    color: var(--text-secondary);\n}\n.privacy-notice p {\n    margin: 0 0 8px 0;\n    font-weight: 600;\n    color: var(--text-primary);\n}\n.privacy-notice ul {\n    margin: 0;\n    padding-left: 18px;\n    list-style: disc;\n    color: var(--text-secondary);\n}\n.privacy-notice li {\n    margin: 3px 0;\n    line-height: 1.5;\n}\n.privacy-notice .privacy-footnote {\n    color: var(--text-muted);\n    opacity: 1;\n    margin-top: 8px;\n}\n\n.results-section {\n    padding: 28px 36px 36px;\n}\n\n/* 하단 크레딧 푸터 */\n.app-footer {\n    padding: 16px 36px 24px 36px;\n    display: flex;\n    align-items: center;\n    justify-content: flex-end;\n    border-top: 1px solid var(--neutral-200);\n}\n.app-footer .footer-right {\n    display: flex;\n    align-items: center;\n    gap: 12px;\n}\n.app-footer .credits {\n    text-align: right;\n    font-size: 0.85rem;\n    color: var(--text-secondary);\n    background: none;\n    padding: 0;\n    border-radius: 0;\n}\n.app-footer .credits a:not(.help-btn) {\n    color: var(--text-muted);\n    text-decoration: none;\n    border-bottom: 1px dashed var(--neutral-400);\n}\n.app-footer .credits a:not(.help-btn):hover {\n    color: var(--text-primary);\n    border-bottom-color: var(--neutral-500);\n}\n\n/* last updated 표시 */\n.app-footer .updated {\n    font-size: 0.8rem;\n    color: var(--text-muted);\n    margin-left: 8px;\n}\n\n/* 도움말 버튼 */\n.help-btn {\n    display: inline-block;\n    padding: 8px 14px;\n    font-size: 0.85rem;\n    line-height: 1;\n    border-radius: 999px;\n    color: var(--text-primary);\n    background: var(--bg-card);\n    border: 1px solid var(--neutral-300);\n    text-decoration: none;\n    transition: all 0.2s ease;\n}\n.help-btn:hover {\n    color: var(--primary-dark);\n    background: var(--neutral-100);\n    border-color: var(--primary);\n    box-shadow: var(--shadow-sm);\n}\n\n.tabs {\n    display: inline-flex;\n    gap: 6px;\n    padding: 6px;\n    background: var(--neutral-100);\n    border: 1px solid var(--neutral-200);\n    border-radius: 16px;\n    margin-bottom: 30px;\n}\n\n.tab-btn {\n    flex: none;\n    min-width: 128px;\n    padding: 12px 18px;\n    background: none;\n    border: none;\n    cursor: pointer;\n    font-size: 0.95rem;\n    font-weight: 500;\n    color: var(--text-secondary);\n    transition: all 0.25s ease;\n    border-radius: 12px;\n    position: relative;\n}\n\n.tab-btn.active {\n    color: var(--text-primary);\n    background: var(--bg-card);\n    box-shadow: var(--shadow-sm);\n}\n\n.tab-btn:hover:not(.active) {\n    background: rgba(255, 255, 255, 0.6);\n    color: var(--text-primary);\n}\n\n.tab-content {\n    display: none;\n}\n\n.tab-content.active {\n    display: block;\n}\n\n.tab-content h2 {\n    color: var(--text-primary);\n    margin-bottom: 22px;\n    font-size: 1.45rem;\n    font-weight: 600;\n}\n\n\n.subject-averages {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));\n    gap: 20px;\n}\n\n.subject-item {\n    background: linear-gradient(180deg, var(--bg-card) 0%, var(--neutral-50) 100%);\n    border-radius: var(--radius-lg);\n    padding: 22px;\n    border: 1px solid var(--neutral-200);\n    transition: all 0.25s ease;\n    box-shadow: none;\n}\n\n.subject-item:hover {\n    transform: translateY(-2px);\n    box-shadow: var(--shadow-md);\n}\n\n.subject-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    margin-bottom: 15px;\n}\n\n.subject-header h3 {\n    color: var(--text-primary);\n    font-size: 1.15rem;\n    font-weight: 600;\n}\n\n.credits {\n    background: var(--neutral-100);\n    color: var(--text-secondary);\n    padding: 5px 10px;\n    border-radius: 15px;\n    border: 1px solid var(--neutral-200);\n    font-size: 0.8rem;\n    font-weight: 500;\n}\n\n.average-score {\n    text-align: center;\n}\n\n.average-score .score {\n    display: block;\n    font-size: 2.2rem;\n    font-weight: 600;\n    color: var(--text-primary);\n    margin-bottom: 5px;\n}\n\n.average-score .label {\n    color: var(--text-secondary);\n    font-size: 0.9rem;\n    text-transform: uppercase;\n    letter-spacing: 1px;\n}\n\n.achievement-bars {\n    margin-top: 20px;\n    padding-top: 20px;\n    border-top: 1px solid var(--neutral-200);\n}\n\n.achievement-bar {\n    display: flex;\n    align-items: center;\n    gap: 10px;\n    margin-bottom: 8px;\n}\n\n.achievement-label {\n    width: 25px;\n    font-weight: 600;\n    color: var(--text-primary);\n    font-size: 0.9rem;\n    text-align: center;\n}\n\n.achievement-bar-container {\n    flex: 1;\n    height: 20px;\n    background: var(--neutral-200);\n    border-radius: 10px;\n    overflow: hidden;\n    position: relative;\n}\n\n.achievement-bar-fill {\n    height: 100%;\n    border-radius: 10px;\n    transition: width 0.8s ease;\n    min-width: 2px;\n}\n\n.achievement-bar:nth-child(1) .achievement-bar-fill { background: linear-gradient(135deg, var(--success), var(--success-light)); }\n.achievement-bar:nth-child(2) .achievement-bar-fill { background: linear-gradient(135deg, var(--info), var(--info-light)); }\n.achievement-bar:nth-child(3) .achievement-bar-fill { background: linear-gradient(135deg, var(--accent), var(--accent-light)); }\n.achievement-bar:nth-child(4) .achievement-bar-fill { background: linear-gradient(135deg, var(--warning), var(--primary-light)); }\n.achievement-bar:nth-child(5) .achievement-bar-fill { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); }\n\n.achievement-percentage {\n    width: 50px;\n    text-align: right;\n    font-weight: 500;\n    color: var(--text-primary);\n    font-size: 0.85rem;\n}\n\n.achievement-distribution {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));\n    gap: 30px;\n}\n\n.distribution-item {\n    background: var(--bg-card);\n    border-radius: var(--radius-md);\n    padding: 25px;\n    box-shadow: var(--shadow-sm);\n    transition: all 0.25s ease;\n}\n\n.distribution-item:hover {\n    transform: translateY(-2px);\n    box-shadow: var(--shadow-md);\n}\n\n.distribution-item h3 {\n    color: var(--text-primary);\n    margin-bottom: 20px;\n    font-size: 1.3rem;\n    font-weight: 500;\n}\n\n.distribution-bars {\n    display: flex;\n    flex-direction: column;\n    gap: 15px;\n}\n\n.grade-bar {\n    display: flex;\n    align-items: center;\n    gap: 15px;\n}\n\n.grade-label {\n    width: 30px;\n    font-weight: 600;\n    color: var(--text-primary);\n    font-size: 1.1rem;\n}\n\n.bar-container {\n    flex: 1;\n    height: 25px;\n    background: var(--neutral-200);\n    border-radius: 15px;\n    overflow: hidden;\n    position: relative;\n}\n\n.bar {\n    height: 100%;\n    background: linear-gradient(135deg, var(--info) 0%, var(--info-light) 100%);\n    border-radius: 15px;\n    transition: width 0.8s ease;\n    min-width: 2px;\n}\n\n.percentage {\n    width: 60px;\n    text-align: right;\n    font-weight: 500;\n    color: var(--text-primary);\n}\n\n.student-analysis {\n    width: 100%;\n}\n\n.search-box {\n    margin-bottom: 25px;\n}\n\n.search-box input {\n    width: 100%;\n    max-width: 400px;\n    padding: 14px 18px;\n    border: 1px solid var(--neutral-300);\n    border-radius: 14px;\n    font-size: 1rem;\n    outline: none;\n    transition: all 0.25s ease;\n    background: var(--bg-card);\n}\n\n.search-box input:focus {\n    border-color: var(--primary);\n    box-shadow: 0 0 0 3px var(--primary-bg);\n}\n\n.students-grid {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));\n    gap: 18px;\n    margin-top: 20px;\n}\n\n.student-card {\n    background: var(--bg-card);\n    border-radius: var(--radius-lg);\n    box-shadow: none;\n    border: 1px solid var(--neutral-200);\n    transition: all 0.25s ease;\n    overflow: hidden;\n}\n\n.student-card:hover {\n    transform: translateY(-2px);\n    box-shadow: var(--shadow-md);\n}\n\n.student-card-header {\n    background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%);\n    color: var(--text-primary);\n    padding: 18px 20px;\n    display: flex;\n    justify-content: space-between;\n    align-items: flex-start;\n    border-bottom: 1px solid var(--neutral-200);\n}\n\n.student-basic-info h4 {\n    margin: 0 0 5px 0;\n    font-size: 1.3rem;\n    font-weight: 600;\n}\n\n.student-number {\n    font-size: 0.88rem;\n    color: var(--text-secondary);\n    opacity: 1;\n}\n\n.student-summary {\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n}\n\n.summary-row {\n    display: flex;\n    gap: 15px;\n    flex-wrap: wrap;\n}\n\n.summary-metric-inline {\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    background: var(--neutral-100);\n    border: 1px solid var(--neutral-200);\n    padding: 6px 10px;\n    border-radius: 6px;\n    min-width: fit-content;\n}\n\n.summary-metric-inline .metric-label {\n    font-size: 0.7rem;\n    color: var(--text-muted);\n    text-transform: uppercase;\n    letter-spacing: 0.5px;\n    white-space: nowrap;\n}\n\n.summary-metric-inline .metric-value {\n    font-size: 0.9rem;\n    font-weight: 700;\n    white-space: nowrap;\n    color: var(--text-primary);\n}\n\n.summary-metric {\n    text-align: center;\n    background: rgba(255, 255, 255, 0.15);\n    padding: 8px 12px;\n    border-radius: 8px;\n    min-width: 70px;\n}\n\n.summary-metric .metric-label {\n    display: block;\n    font-size: 0.7rem;\n    opacity: 0.8;\n    margin-bottom: 2px;\n    text-transform: uppercase;\n    letter-spacing: 0.5px;\n}\n\n.summary-metric .metric-value {\n    display: block;\n    font-size: 1.1rem;\n    font-weight: 700;\n}\n\n.student-subjects {\n    padding: 15px 20px;\n    max-height: none;\n    overflow: visible;\n}\n\n.subject-row {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 8px 0;\n    border-bottom: 1px solid var(--neutral-200);\n}\n\n.subject-row:last-child {\n    border-bottom: none;\n}\n\n.subject-row.no-grade {\n    opacity: 0.7;\n}\n\n.subject-name {\n    font-weight: 500;\n    color: var(--text-primary);\n    flex: 1;\n    font-size: 0.9rem;\n}\n\n.subject-data {\n    display: flex;\n    gap: 8px;\n    align-items: center;\n}\n\n.subject-score {\n    font-weight: 600;\n    color: var(--primary);\n    font-size: 0.85rem;\n    min-width: 45px;\n    text-align: right;\n}\n\n.subject-achievement {\n    font-size: 0.8rem;\n    padding: 2px 6px;\n    border-radius: 3px;\n    min-width: 20px;\n    text-align: center;\n}\n\n.subject-grade {\n    font-weight: 500;\n    color: var(--text-secondary);\n    font-size: 0.8rem;\n    min-width: 35px;\n    text-align: center;\n}\n\n.subject-percentile {\n    font-weight: 500;\n    color: var(--success);\n    font-size: 0.8rem;\n    min-width: 40px;\n    text-align: right;\n}\n\n.student-card-footer {\n    background: var(--bg-card);\n    padding: 15px 20px;\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    border-top: 1px solid var(--neutral-200);\n}\n\n.grade-subjects-count {\n    font-size: 0.85rem;\n    color: var(--text-secondary);\n}\n\n.view-detail-btn {\n    background: var(--bg-card);\n    color: var(--text-primary);\n    border: 1px solid var(--neutral-300);\n    padding: 8px 16px;\n    border-radius: var(--radius-sm);\n    font-size: 0.85rem;\n    cursor: pointer;\n    transition: all 0.25s ease;\n    font-weight: 500;\n}\n\n.view-detail-btn:hover {\n    transform: translateY(-1px);\n    border-color: var(--primary);\n    color: var(--primary-dark);\n    box-shadow: var(--shadow-sm);\n}\n\n.achievement.A {\n    background: var(--success);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n\n.achievement.B {\n    background: var(--info);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n\n.achievement.C {\n    background: var(--accent);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n\n.achievement.D {\n    background: var(--warning);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n\n.achievement.E, .achievement.미도달 {\n    background: var(--primary);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n\n.score {\n    font-weight: 600;\n    color: var(--text-primary);\n}\n\n.grade {\n    text-align: center;\n    font-weight: 500;\n}\n\n.rank {\n    text-align: center;\n    font-weight: 500;\n    color: var(--text-secondary);\n}\n\n.avg-grade {\n    text-align: center;\n    font-weight: 600;\n    color: var(--primary);\n    font-size: 1.1rem;\n}\n\n.grade-analysis-container {\n    display: grid;\n    grid-template-columns: 1fr 1fr;\n    grid-template-rows: auto auto;\n    gap: 20px;\n    margin-bottom: 30px;\n}\n\n.chart-section {\n    background: linear-gradient(180deg, var(--bg-card) 0%, var(--neutral-50) 100%);\n    border-radius: var(--radius-lg);\n    padding: 22px;\n    text-align: center;\n    border: 1px solid var(--neutral-200);\n}\n\n.chart-section h3 {\n    color: var(--text-primary);\n    margin-bottom: 20px;\n    font-size: 1.3rem;\n    font-weight: 500;\n}\n\n.chart-section canvas {\n    max-width: 100%;\n    height: 350px !important;\n}\n\n.stats-section {\n    grid-column: 1 / -1;\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n    gap: 16px;\n    background: linear-gradient(180deg, var(--bg-card) 0%, var(--neutral-50) 100%);\n    border-radius: var(--radius-lg);\n    padding: 22px;\n    border: 1px solid var(--neutral-200);\n}\n\n.stat-item {\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    text-align: center;\n    background: var(--bg-card);\n    border-radius: var(--radius-md);\n    padding: 20px;\n    box-shadow: none;\n    border: 1px solid var(--neutral-200);\n}\n\n.stat-label {\n    color: var(--text-secondary);\n    font-size: 0.9rem;\n    text-transform: uppercase;\n    letter-spacing: 1px;\n    margin-bottom: 8px;\n}\n\n.stat-value {\n    color: var(--text-primary);\n    font-size: 2rem;\n    font-weight: 600;\n}\n\n@media (max-width: 768px) {\n    .grade-analysis-container {\n        grid-template-columns: 1fr;\n        gap: 20px;\n    }\n    \n    .stats-section {\n        grid-template-columns: repeat(2, 1fr);\n        gap: 15px;\n    }\n    \n    .chart-section {\n        padding: 15px;\n    }\n    \n    .stat-item {\n        padding: 15px;\n    }\n    \n    .stat-value {\n        font-size: 1.5rem;\n    }\n}\n\n.loading {\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;\n    padding: 60px;\n    color: var(--text-secondary);\n}\n\n.spinner {\n    width: 50px;\n    height: 50px;\n    border: 4px solid var(--neutral-200);\n    border-top: 4px solid var(--primary);\n    border-radius: 50%;\n    animation: spin 1s linear infinite;\n    margin-bottom: 20px;\n}\n\n@keyframes spin {\n    0% { transform: rotate(0deg); }\n    100% { transform: rotate(360deg); }\n}\n\n.loading p {\n    font-size: 1.1rem;\n    color: var(--text-secondary);\n}\n\n.error-message {\n    background: var(--warning-bg);\n    color: var(--warning);\n    padding: 20px;\n    margin: 20px 40px;\n    border-radius: var(--radius-md);\n    border-left: 5px solid var(--warning);\n    font-size: 1rem;\n}\n\n.file-list {\n    background: var(--neutral-100);\n    border-radius: var(--radius-lg);\n    padding: 20px;\n    margin: 20px 0;\n    border: 1px solid var(--neutral-200);\n}\n\n.file-list h4 {\n    color: var(--text-primary);\n    margin-bottom: 15px;\n    font-size: 1.1rem;\n}\n\n.file-list ul {\n    list-style: none;\n    padding: 0;\n}\n\n.file-list li {\n    background: var(--bg-card);\n    padding: 10px 15px;\n    margin: 8px 0;\n    border-radius: var(--radius-sm);\n    border: 1px solid var(--neutral-200);\n    box-shadow: none;\n}\n\n.file-selector-section {\n    background: var(--bg-card);\n    padding: 20px;\n    border-radius: var(--radius-lg);\n    margin-bottom: 20px;\n    display: flex;\n    align-items: center;\n    gap: 15px;\n    border: 1px solid var(--neutral-200);\n}\n\n.file-selector-section label {\n    color: var(--text-primary);\n    font-weight: 500;\n    white-space: nowrap;\n}\n\n.file-select {\n    flex: 1;\n    padding: 10px 15px;\n    border: 2px solid var(--neutral-300);\n    border-radius: var(--radius-sm);\n    font-size: 1rem;\n    background: var(--bg-card);\n    outline: none;\n    transition: all 0.25s ease;\n}\n\n.file-select:focus {\n    border-color: var(--primary);\n    box-shadow: 0 0 0 3px var(--primary-bg);\n}\n\n.comparison-container {\n    display: grid;\n    grid-template-columns: 1fr;\n    gap: 30px;\n}\n\n.comparison-section {\n    background: var(--neutral-100);\n    border-radius: var(--radius-lg);\n    padding: 25px;\n    border: 1px solid var(--border-light);\n}\n\n.comparison-section h3 {\n    color: var(--text-primary);\n    margin-bottom: 20px;\n    font-size: 1.3rem;\n    font-weight: 500;\n}\n\n.comparison-table {\n    width: 100%;\n    border-collapse: collapse;\n    background: var(--bg-card);\n    border-radius: var(--radius-md);\n    overflow: hidden;\n    box-shadow: var(--shadow-sm);\n}\n\n.comparison-table th,\n.comparison-table td {\n    padding: 12px 15px;\n    text-align: center;\n    border-bottom: 1px solid var(--neutral-200);\n}\n\n.comparison-table th {\n    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);\n    color: var(--text-inverse);\n    font-weight: 500;\n    font-size: 0.9rem;\n}\n\n.comparison-table tr:nth-child(even) {\n    background: var(--neutral-100);\n}\n\n.comparison-table tr:hover {\n    background: var(--primary-bg);\n}\n\n@media (max-width: 768px) {\n    .file-selector-section {\n        flex-direction: column;\n        align-items: stretch;\n        gap: 10px;\n    }\n    \n    .file-select {\n        width: 100%;\n    }\n    \n    .comparison-table {\n        font-size: 0.8rem;\n    }\n    \n    .comparison-table th,\n    .comparison-table td {\n        padding: 8px 6px;\n    }\n}\n\n/* 학생 선택 및 상세 분석 스타일 */\n.student-selector {\n    display: flex;\n    align-items: center;\n    gap: 15px;\n    background: var(--bg-card);\n    padding: 20px;\n    border-radius: var(--radius-lg);\n    margin-bottom: 20px;\n    flex-wrap: wrap;\n    border: 1px solid var(--neutral-200);\n    box-shadow: var(--shadow-sm);\n}\n\n.selector-group {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n\n.selector-group label {\n    font-weight: 500;\n    color: var(--text-primary);\n    white-space: nowrap;\n}\n\n.selector {\n    padding: 10px 12px;\n    border: 1px solid var(--neutral-300);\n    border-radius: var(--radius-sm);\n    font-size: 0.9rem;\n    background: var(--bg-card);\n    min-width: 120px;\n    transition: all 0.25s ease;\n}\n\n.selector:focus {\n    border-color: var(--primary);\n    outline: none;\n    box-shadow: 0 0 0 3px var(--primary-bg);\n}\n\n.detail-btn {\n    background: var(--bg-card);\n    color: var(--text-primary);\n    border: 1px solid var(--neutral-300);\n    padding: 10px 20px;\n    border-radius: var(--radius-sm);\n    font-size: 0.9rem;\n    cursor: pointer;\n    transition: all 0.25s ease;\n    white-space: nowrap;\n}\n\n.detail-btn:hover:not(:disabled) {\n    transform: translateY(-2px);\n    box-shadow: var(--shadow-sm);\n    border-color: var(--primary);\n    color: var(--primary-dark);\n}\n\n.detail-btn:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n}\n\n.view-toggle {\n    display: flex;\n    background: var(--neutral-100);\n    border-radius: var(--radius-md);\n    padding: 4px;\n    margin-bottom: 20px;\n    width: fit-content;\n    border: 1px solid var(--neutral-200);\n}\n\n.toggle-btn {\n    background: none;\n    border: none;\n    padding: 10px 20px;\n    border-radius: var(--radius-sm);\n    cursor: pointer;\n    transition: all 0.25s ease;\n    font-weight: 500;\n    color: var(--text-secondary);\n}\n\n.toggle-btn.active {\n    background: var(--bg-card);\n    color: var(--text-primary);\n    box-shadow: var(--shadow-sm);\n}\n\n/* 학생 상세 분석 스타일 */\n.student-detail-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: flex-start;\n    background: linear-gradient(180deg, var(--bg-card) 0%, var(--neutral-100) 100%);\n    color: var(--text-primary);\n    padding: 22px 24px;\n    border-radius: var(--radius-lg);\n    margin-bottom: 20px;\n    border: 1px solid var(--border-light);\n    box-shadow: var(--shadow-md);\n}\n\n.student-info h3 {\n    font-size: 1.5rem;\n    margin-bottom: 6px;\n    font-weight: 400;\n}\n\n.student-meta {\n    display: flex;\n    gap: 14px;\n    font-size: 0.85rem;\n    opacity: 0.9;\n    flex-wrap: wrap;\n}\n\n.overall-stats {\n    display: flex;\n    gap: 12px;\n}\n\n.stat-card {\n    text-align: center;\n    background: var(--bg-card);\n    padding: 12px 16px;\n    border-radius: var(--radius-md);\n    border: 1px solid var(--border-light);\n    box-shadow: var(--shadow-sm);\n    min-width: 110px;\n}\n\n.stat-label {\n    display: block;\n    font-size: 0.8rem;\n    opacity: 0.8;\n    margin-bottom: 5px;\n    text-transform: uppercase;\n    letter-spacing: 1px;\n}\n\n.stat-value {\n    display: block;\n    font-size: 1.35rem;\n    font-weight: 700;\n    color: var(--text-primary);\n}\n\n.stat-value.grade {\n    color: var(--primary);\n}\n\n.student-detail-content {\n    display: flex;\n    flex-direction: column;\n    gap: 22px;\n    margin-bottom: 24px;\n}\n\n.analysis-overview {\n    display: grid;\n    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);\n    gap: 20px;\n    margin-bottom: 20px;\n    align-items: start;\n}\n\n.student-summary {\n    display: flex;\n    flex-direction: column;\n    gap: 20px;\n}\n\n.summary-card {\n    background: var(--bg-card);\n    border-radius: var(--radius-lg);\n    padding: 18px 20px;\n    box-shadow: var(--shadow-md);\n    border: 1px solid var(--border-light);\n}\n\n.summary-header {\n    margin-bottom: 14px;\n    padding-bottom: 10px;\n    border-bottom: 1px solid var(--neutral-200);\n}\n\n.summary-header h4 {\n    color: var(--text-primary);\n    font-size: 1.2rem;\n    font-weight: 600;\n    margin: 0;\n}\n\n.summary-grid {\n    display: grid;\n    gap: 10px;\n}\n\n.summary-item {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 8px 0;\n    border-bottom: 1px solid var(--border-light);\n}\n\n.summary-item:last-child {\n    border-bottom: none;\n}\n\n.summary-label {\n    font-weight: 500;\n    color: var(--text-secondary);\n    font-size: 0.9rem;\n    text-transform: uppercase;\n    letter-spacing: 0.5px;\n}\n\n.summary-value {\n    font-weight: 600;\n    color: var(--text-primary);\n    font-size: 1rem;\n    text-align: right;\n}\n\n.summary-value-group {\n    display: flex;\n    flex-direction: column;\n    align-items: flex-end;\n    gap: 4px;\n}\n\n.summary-value.highlight {\n    color: var(--primary);\n    font-size: 1.05rem;\n    font-weight: 600;\n}\n\n.summary-value.orange {\n    color: var(--accent);\n    font-size: 1.05rem;\n    font-weight: 600;\n}\n\n.summary-note {\n    font-size: 0.72rem;\n    color: var(--text-muted);\n    text-align: right;\n    line-height: 1.35;\n    max-width: 210px;\n}\n\n.metric-value.orange {\n    color: var(--accent);\n    font-weight: 600;\n}\n\n.chart-container {\n    background: var(--neutral-100);\n    border-radius: var(--radius-lg);\n    padding: 16px 18px 18px;\n    text-align: center;\n    border: 1px solid var(--border-light);\n    width: 100%;\n    max-width: 420px;\n    justify-self: end;\n}\n\n.chart-container h4 {\n    color: var(--text-primary);\n    margin-bottom: 12px;\n    font-size: 1rem;\n    font-weight: 600;\n}\n\n.chart-container canvas {\n    display: block;\n    width: min(100%, 320px) !important;\n    height: auto !important;\n    margin: 0 auto;\n}\n\n.subject-details h4 {\n    color: var(--text-primary);\n    margin-bottom: 20px;\n    font-size: 1.2rem;\n    font-weight: 500;\n}\n\n.subject-cards {\n    display: grid;\n    grid-template-columns: repeat(2, 1fr);\n    gap: 16px;\n    max-height: none;\n}\n\n@media (max-width: 1200px) {\n    .subject-cards {\n        grid-template-columns: 1fr;\n    }\n}\n\n/* 교과(군)별 섹션 스타일 */\n.subject-group-section {\n    background: var(--neutral-100);\n    border-radius: var(--radius-lg);\n    padding: 20px;\n    border: 1px solid var(--border-light);\n}\n\n.subject-group-header {\n    display: flex;\n    align-items: center;\n    gap: 12px;\n    padding: 12px 16px;\n    background: var(--bg-card);\n    border-radius: var(--radius-md);\n    margin-bottom: 16px;\n    box-shadow: var(--shadow-sm);\n}\n\n.subject-group-header h5 {\n    margin: 0;\n    font-size: 1rem;\n    font-weight: 600;\n    color: var(--text-primary);\n}\n\n.subject-group-header .subject-count {\n    font-size: 0.8rem;\n    color: var(--text-secondary);\n    background: var(--neutral-200);\n    padding: 4px 10px;\n    border-radius: 10px;\n    font-weight: 500;\n}\n\n.subject-group-cards {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));\n    gap: 15px;\n}\n\n/* 컴팩트 테이블 스타일 */\n.subject-group-section.compact {\n    padding: 14px;\n    margin-bottom: 0;\n    height: fit-content;\n}\n\n.subject-group-section.compact .subject-group-header {\n    margin-bottom: 12px;\n    padding: 8px 12px;\n}\n\n.subject-group-section.compact .subject-group-header h5 {\n    font-size: 0.95rem;\n}\n\n.subject-table {\n    width: 100%;\n    border-collapse: collapse;\n    background: var(--bg-card);\n    border-radius: var(--radius-md);\n    overflow: hidden;\n    font-size: 0.8rem;\n}\n\n.subject-table thead {\n    background: linear-gradient(135deg, var(--neutral-200) 0%, var(--neutral-100) 100%);\n}\n\n.subject-table th {\n    padding: 8px 6px;\n    text-align: center;\n    font-weight: 600;\n    color: var(--text-primary);\n    font-size: 0.75rem;\n    text-transform: uppercase;\n    letter-spacing: 0.3px;\n    border-bottom: 2px solid var(--neutral-300);\n}\n\n.subject-table th:first-child {\n    text-align: left;\n    padding-left: 10px;\n}\n\n.subject-table td {\n    padding: 8px 6px;\n    border-bottom: 1px solid var(--neutral-200);\n    color: var(--text-primary);\n}\n\n.subject-table td.center {\n    text-align: center;\n}\n\n.subject-table td.subject-name-cell {\n    font-weight: 500;\n    padding-left: 10px;\n    max-width: 100px;\n    white-space: nowrap;\n    overflow: hidden;\n    text-overflow: ellipsis;\n}\n\n.subject-table tbody tr:hover {\n    background: var(--neutral-100);\n}\n\n.subject-table tbody tr:last-child td {\n    border-bottom: none;\n}\n\n.subject-table tr.no-grade-row {\n    opacity: 0.7;\n    background: var(--neutral-50);\n}\n\n.subject-table .score-value {\n    font-weight: 600;\n    color: var(--text-primary);\n}\n\n.subject-table .avg-value {\n    font-size: 0.75rem;\n    color: var(--text-muted);\n    margin-left: 2px;\n}\n\n.subject-table .achievement-badge {\n    display: inline-block;\n    padding: 2px 8px;\n    border-radius: 4px;\n    font-weight: 600;\n    font-size: 0.8rem;\n}\n\n.subject-table .achievement-badge.A { background: var(--success); color: var(--text-inverse); }\n.subject-table .achievement-badge.B { background: var(--info); color: var(--text-inverse); }\n.subject-table .achievement-badge.C { background: var(--accent); color: var(--text-inverse); }\n.subject-table .achievement-badge.D { background: var(--warning); color: var(--text-inverse); }\n.subject-table .achievement-badge.E { background: var(--primary); color: var(--text-inverse); }\n\n.subject-table .grade9-value {\n    color: var(--accent);\n    font-weight: 600;\n}\n\n@media (max-width: 768px) {\n    .subject-table {\n        font-size: 0.75rem;\n    }\n\n    .subject-table th,\n    .subject-table td {\n        padding: 8px 4px;\n    }\n\n    .subject-table td.subject-name-cell {\n        max-width: 80px;\n    }\n\n    .subject-table .avg-value {\n        display: none;\n    }\n}\n\n.subject-card.no-grade {\n    opacity: 0.8;\n    border-left: 4px solid var(--neutral-500);\n}\n\n.subject-metrics.simple {\n    grid-template-columns: 1fr 1fr;\n    margin-bottom: 0;\n}\n\n.no-grade-notice {\n    text-align: center;\n    padding: 15px;\n    background: var(--neutral-200);\n    border-radius: var(--radius-sm);\n    margin-top: 15px;\n}\n\n.no-grade-notice span {\n    color: var(--text-secondary);\n    font-size: 0.9rem;\n    font-style: italic;\n}\n\n.subject-card {\n    background: var(--bg-card);\n    border-radius: var(--radius-md);\n    padding: 18px;\n    box-shadow: var(--shadow-sm);\n    transition: all 0.2s ease;\n    border: 1px solid var(--border-light);\n}\n\n.subject-card:hover {\n    box-shadow: var(--shadow-md);\n    border-color: var(--border-medium);\n}\n\n.subject-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    margin-bottom: 15px;\n    padding-bottom: 10px;\n    border-bottom: 2px solid var(--neutral-200);\n}\n\n.subject-header h5 {\n    color: var(--text-primary);\n    font-size: 1.1rem;\n    font-weight: 600;\n    margin: 0;\n}\n\n.subject-header .credits {\n    background: var(--info);\n    color: var(--text-inverse);\n    padding: 4px 8px;\n    border-radius: 12px;\n    font-size: 0.8rem;\n    font-weight: 500;\n}\n\n.subject-metrics {\n    display: grid;\n    grid-template-columns: repeat(3, 1fr);\n    gap: 15px;\n    margin-bottom: 15px;\n}\n\n.subject-metrics:last-of-type {\n    grid-template-columns: 1fr 1fr 0fr;\n}\n\n.metric {\n    text-align: center;\n}\n\n.metric-label {\n    display: block;\n    font-size: 0.8rem;\n    color: var(--text-secondary);\n    margin-bottom: 5px;\n    text-transform: uppercase;\n    letter-spacing: 0.5px;\n}\n\n.metric-value {\n    display: block;\n    font-size: 1rem;\n    font-weight: 600;\n    color: var(--text-primary);\n}\n\n.metric-average {\n    display: block;\n    font-size: 0.8rem;\n    color: var(--text-secondary);\n    font-weight: normal;\n    margin-top: 2px;\n}\n\n.metric-value.achievement.A {\n    background: var(--success);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n.metric-value.achievement.B {\n    background: var(--info);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n.metric-value.achievement.C {\n    background: var(--accent);\n    color: var(--text-primary);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n.metric-value.achievement.D {\n    background: var(--warning);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n.metric-value.achievement.E, .metric-value.achievement.미도달 {\n    background: var(--primary);\n    color: var(--text-inverse);\n    font-weight: bold;\n    padding: 4px 8px;\n    border-radius: 4px;\n}\n\n.percentile-bar {\n    height: 8px;\n    background: var(--neutral-200);\n    border-radius: 4px;\n    overflow: hidden;\n    position: relative;\n}\n\n.percentile-fill {\n    height: 100%;\n    border-radius: 4px;\n    transition: width 0.8s ease;\n}\n\n.percentile-fill.excellent { background: linear-gradient(90deg, var(--success), var(--success-light)); }\n.percentile-fill.good { background: linear-gradient(90deg, var(--info), var(--info-light)); }\n.percentile-fill.average { background: linear-gradient(90deg, var(--warning), var(--warning-light)); }\n.percentile-fill.low { background: linear-gradient(90deg, var(--neutral-500), var(--neutral-400)); }\n\n.percentile.excellent { color: var(--success); font-weight: 600; }\n.percentile.good { color: var(--info); font-weight: 600; }\n.percentile.average { color: var(--warning); font-weight: 600; }\n.percentile.low { color: var(--neutral-500); font-weight: 500; }\n\n@media (max-width: 1024px) {\n    .analysis-overview {\n        grid-template-columns: 1fr;\n        gap: 20px;\n    }\n    \n    .chart-container {\n        padding: 20px;\n    }\n    \n    .student-detail-header {\n        flex-direction: column;\n        gap: 20px;\n    }\n    \n    .overall-stats {\n        align-self: stretch;\n        justify-content: space-around;\n    }\n    \n    .subject-cards {\n        grid-template-columns: 1fr;\n    }\n}\n\n/* 출력용 스타일 */\n@page {\n    size: A4 portrait;\n    margin: 10mm;\n}\n@media print {\n    .print-area {\n        transform-origin: top left !important;\n    }\n    .print-area.apply-print-scale {\n        transform: scale(var(--page-scale, 1)) !important;\n    }\n    * {\n        -webkit-print-color-adjust: exact !important;\n        color-adjust: exact !important;\n        print-color-adjust: exact !important;\n    }\n    \n    body {\n        background: white !important;\n        margin: 0;\n        padding: 0;\n        font-size: 12px;\n        line-height: 1.4;\n        color: #000 !important;\n    }\n    \n    .container {\n        max-width: none;\n        margin: 0;\n        box-shadow: none;\n        border-radius: 0;\n        background: white;\n    }\n    \n    header {\n        display: none !important;\n    }\n    \n    .upload-section,\n    .tabs,\n    .view-toggle,\n    .student-selector,\n    .search-box,\n    .print-controls {\n        display: none !important;\n    }\n    \n    .results-section {\n        padding: 15px;\n    }\n    \n    .tab-content {\n        display: block !important;\n    }\n    \n    .tab-content:not(.print-target) {\n        display: none !important;\n    }\n\n    /* 학생 탭 인쇄 시 개인 상세 페이지만 표시 */\n    #students-tab.only-class-print > *:not(.class-print-area) {\n        display: none !important;\n    }\n\n    /* A4에 맞춘 폭 고정 및 중앙 정렬 */\n    .class-print-area {\n        width: 190mm;\n        margin: 0 auto;\n    }\n    .class-print-area .student-print-page {\n        width: 190mm;\n        transform-origin: top left !important;\n    }\n    .class-print-area .student-print-page.apply-print-scale {\n        transform: scale(var(--page-scale, 1)) !important;\n    }\n\n    /* 학급 전체 인쇄 모드: 더 컴팩트한 카드와 차트 크기 */\n    #students-tab.only-class-print .student-detail-header {\n        padding: 12px;\n        margin-bottom: 10px;\n    }\n    #students-tab.only-class-print .student-info h3 {\n        font-size: 14px;\n    }\n    #students-tab.only-class-print .student-meta {\n        font-size: 11px;\n    }\n    #students-tab.only-class-print .summary-card,\n    #students-tab.only-class-print .stat-card {\n        margin-bottom: 8px;\n        padding: 10px;\n    }\n    \n    /* 별도 프린트 헤더는 사용하지 않음 */\n    .print-header {\n        display: none !important;\n    }\n    \n    .print-header h2 {\n        margin: 0;\n        color: #2c3e50;\n        font-size: 18px;\n        font-weight: bold;\n    }\n    \n    .print-date {\n        margin-top: 10px;\n        font-size: 12px;\n        color: #666;\n    }\n    \n    .student-detail-header {\n        background: #f8f9fa !important;\n        border: 2px solid #4facfe;\n        margin-bottom: 15px;\n        padding: 20px;\n        page-break-after: avoid;\n    }\n    \n    .student-info h3 {\n        color: #2c3e50 !important;\n        font-size: 16px;\n        margin-bottom: 8px;\n    }\n    \n    .student-meta {\n        color: #666 !important;\n        font-size: 12px;\n    }\n    \n    .stat-card {\n        border: 1px solid #ddd !important;\n        background: white !important;\n    }\n    \n    .stat-label {\n        color: #666 !important;\n        font-size: 10px;\n    }\n    \n    .stat-value {\n        color: #2c3e50 !important;\n        font-size: 14px;\n    }\n    \n    .analysis-overview {\n        grid-template-columns: 1fr;\n        gap: 15px;\n        page-break-inside: avoid;\n    }\n    \n    /* 레이더 차트도 출력/PDF에 포함 */\n    .chart-container {\n        display: block !important;\n    }\n    \n    .summary-card {\n        border: 1px solid #ddd !important;\n        background: #f9f9f9 !important;\n        margin-bottom: 15px;\n    }\n    \n    .summary-header h4 {\n        color: #2c3e50 !important;\n        font-size: 14px;\n    }\n    \n    .summary-label {\n        color: #666 !important;\n        font-size: 11px;\n    }\n    \n    .summary-value {\n        color: #2c3e50 !important;\n        font-size: 12px;\n    }\n    \n    .summary-value.highlight {\n        color: #4facfe !important;\n        font-weight: bold;\n    }\n    \n    .subject-details h4 {\n        color: #2c3e50 !important;\n        font-size: 14px;\n        margin-bottom: 15px;\n    }\n    \n    .subject-cards {\n        grid-template-columns: repeat(2, 1fr);\n        gap: 10px;\n        page-break-inside: avoid;\n    }\n    \n    .subject-card {\n        border: 1px solid #ddd !important;\n        background: white !important;\n        page-break-inside: avoid;\n        margin-bottom: 8px;\n        padding: 12px;\n    }\n    \n    .subject-header h5 {\n        color: #2c3e50 !important;\n        font-size: 12px;\n        margin: 0 0 8px 0;\n    }\n    \n    .subject-header .credits {\n        background: #4facfe !important;\n        color: white !important;\n        font-size: 9px;\n        padding: 2px 6px;\n    }\n    \n    .subject-metrics {\n        gap: 8px;\n        margin-bottom: 8px;\n    }\n    \n    .metric-label {\n        font-size: 9px;\n        color: #666 !important;\n    }\n    \n    .metric-value {\n        font-size: 11px;\n        color: #2c3e50 !important;\n    }\n    \n    .metric-average {\n        font-size: 9px;\n        color: #666 !important;\n    }\n    \n    .percentile-bar {\n        height: 6px;\n        background: #e9ecef !important;\n    }\n    \n    .no-grade-notice {\n        background: rgba(108, 117, 125, 0.1) !important;\n        font-size: 10px;\n    }\n    \n    .no-grade-notice span {\n        color: #666 !important;\n    }\n    \n    /* 성취도 색상 */\n    .achievement.A, .metric-value.achievement.A { \n        background: #28a745 !important; \n        color: white !important; \n    }\n    .achievement.B, .metric-value.achievement.B { \n        background: #17a2b8 !important; \n        color: white !important; \n    }\n    .achievement.C, .metric-value.achievement.C { \n        background: #ffc107 !important; \n        color: #212529 !important; \n    }\n    .achievement.D, .metric-value.achievement.D { \n        background: #fd7e14 !important; \n        color: white !important; \n    }\n    .achievement.E, .achievement.미도달, \n    .metric-value.achievement.E, .metric-value.achievement.미도달 { \n        background: #dc3545 !important; \n        color: white !important; \n    }\n    \n    /* 페이지 나누기 규칙 */\n    .subject-card {\n        break-inside: avoid;\n    }\n    \n    .summary-card {\n        break-inside: avoid;\n    }\n\n    /* 학급 전체 인쇄: 학생별 한 페이지씩 */\n    .class-print-area .student-print-page {\n        page-break-after: always;\n        break-after: page;\n    }\n    .class-print-area .student-print-page:last-child {\n        page-break-after: auto;\n        break-after: auto;\n    }\n}\n\n/* PDF 출력 버튼 스타일 */\n.print-controls {\n    display: flex;\n    gap: 10px;\n    margin-bottom: 20px;\n    flex-wrap: wrap;\n    align-items: center;\n    justify-content: space-between;\n}\n\n.student-nav-controls {\n    display: flex;\n    align-items: center;\n    gap: 10px;\n    flex-wrap: wrap;\n}\n\n.student-nav-status {\n    color: var(--text-secondary);\n    font-size: 0.9rem;\n    font-weight: 600;\n    padding: 0 4px;\n}\n\n.print-btn, .pdf-btn {\n    background: linear-gradient(135deg, var(--success) 0%, var(--success-light) 100%);\n    color: var(--text-inverse);\n    border: none;\n    padding: 10px 20px;\n    border-radius: var(--radius-sm);\n    font-size: 0.9rem;\n    cursor: pointer;\n    transition: all 0.25s ease;\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    font-weight: 500;\n}\n\n.pdf-btn {\n    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);\n}\n\n.print-btn:hover, .pdf-btn:hover {\n    transform: translateY(-2px);\n    box-shadow: var(--shadow-md);\n}\n\n.print-btn::before {\n    content: \"🖨️\";\n    font-size: 16px;\n}\n\n.pdf-btn::before {\n    content: \"📄\";\n    font-size: 16px;\n}\n\n@media (max-width: 768px) {\n    .student-selector {\n        flex-direction: column;\n        align-items: stretch;\n        gap: 15px;\n    }\n\n    .selector-group {\n        justify-content: space-between;\n    }\n\n    .selector {\n        min-width: unset;\n        flex: 1;\n    }\n\n    .subject-metrics {\n        grid-template-columns: repeat(2, 1fr);\n        gap: 10px;\n    }\n\n    .container {\n        margin: 10px;\n        border-radius: var(--radius-lg);\n    }\n\n    header {\n        padding: 20px;\n    }\n\n    header h1 {\n        font-size: 1.6rem;\n    }\n\n    .header-subtitle {\n        font-size: 0.92rem;\n    }\n\n    .upload-section,\n    .results-section {\n        padding: 20px;\n    }\n\n    .file-input-label {\n        min-height: 74px;\n        padding: 16px 18px;\n    }\n\n    .action-buttons {\n        flex-direction: column;\n        align-items: stretch;\n    }\n\n    .subject-averages {\n        grid-template-columns: 1fr;\n    }\n\n    .tabs {\n        display: grid;\n        grid-template-columns: repeat(3, minmax(0, 1fr));\n        width: 100%;\n    }\n\n    .tab-btn {\n        min-width: 0;\n        padding: 12px 10px;\n    }\n\n    .tab-btn.active {\n        border-left: none;\n    }\n\n    .students-grid {\n        grid-template-columns: 1fr;\n        gap: 15px;\n    }\n\n    .student-card-header {\n        flex-direction: column;\n        gap: 15px;\n        align-items: stretch;\n    }\n\n    .student-summary {\n        justify-content: space-around;\n    }\n\n    .subject-data {\n        gap: 6px;\n    }\n\n    .subject-name {\n        font-size: 0.85rem;\n    }\n\n    .subject-score, .subject-achievement, .subject-grade, .subject-percentile {\n        font-size: 0.75rem;\n    }\n\n    .print-controls {\n        justify-content: center;\n    }\n\n    .print-btn, .pdf-btn {\n        flex: 1;\n        min-width: 120px;\n        justify-content: center;\n    }\n\n    .analyze-btn,\n    .secondary-btn {\n        width: 100%;\n        justify-content: center;\n    }\n\n    .print-controls,\n    .student-nav-controls {\n        justify-content: center;\n    }\n}\n";
    }

    // JavaScript 파일 내용 가져오기 (실제 동작하는 버전)
    async getScriptJS() {
        return `
// 독립형 HTML용 ScoreAnalyzer 클래스
class StandaloneScoreAnalyzer {
    constructor() {
        this.combinedData = window.PRELOADED_DATA || null;
        this.initializeEventListeners();
        if (this.combinedData) {
            this.displayResults();
        }
    }

    initializeEventListeners() {
        // 탭 전환 기능
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.getAttribute('data-tab'));
            });
        });

        // 학생 선택 기능들
        const studentSearch = document.getElementById('studentSearch');
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentSelect = document.getElementById('studentSelect');
        const studentNameSearch = document.getElementById('studentNameSearch');

        if (gradeSelect) {
            gradeSelect.addEventListener('change', () => {
                this.updateClassOptions();
                this.updateStudentOptions();
                this.filterStudentTable();
            });
        }

        if (classSelect) {
            classSelect.addEventListener('change', () => {
                this.updateStudentOptions();
                this.filterStudentTable();
            });
        }

        if (studentNameSearch) {
            studentNameSearch.addEventListener('input', () => {
                this.updateStudentOptions();
            });
        }

        if (studentSearch) {
            studentSearch.addEventListener('input', () => {
                this.filterStudentTable();
            });
        }

        if (studentSelect) {
            studentSelect.addEventListener('change', () => {
                const showBtn = document.getElementById('showStudentDetail');
                if (showBtn) {
                    showBtn.disabled = !studentSelect.value;
                }
            });
        }

        // 상세 분석 버튼
        const showStudentDetail = document.getElementById('showStudentDetail');
        if (showStudentDetail) {
            showStudentDetail.addEventListener('click', () => {
                this.showStudentDetail();
            });
        }

        // 뷰 전환 버튼들
        const tableViewBtn = document.getElementById('tableViewBtn');
        const detailViewBtn = document.getElementById('detailViewBtn');

        if (tableViewBtn) {
            tableViewBtn.addEventListener('click', () => {
                this.switchView('table');
            });
        }

        if (detailViewBtn) {
            detailViewBtn.addEventListener('click', () => {
                this.switchView('detail');
            });
        }
    }

    switchTab(tabName) {
        // 모든 탭 버튼과 콘텐츠 비활성화
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
        
        // 선택된 탭 활성화
        const tabBtn = document.querySelector('[data-tab="' + tabName + '"]');
        const tabContent = document.getElementById(tabName + '-tab');
        
        if (tabBtn) tabBtn.classList.add('active');
        if (tabContent) tabContent.style.display = 'block';
    }

    displayResults() {
        if (!this.combinedData) return;
        
        this.displaySubjectAverages();
        this.displayGradeAnalysis();
        this.displayStudentAnalysis();
        if (document.querySelector('[data-tab="grade-analysis"]') && document.getElementById('grade-analysis-tab')) {
            this.switchTab('grade-analysis');
        }
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
                    distributionHTML += \`
                        <div class="achievement-bar">
                            <span class="achievement-label">\${grade}</span>
                            <div class="achievement-bar-container">
                                <div class="achievement-bar-fill" style="width: \${percentage}%"></div>
                            </div>
                            <span class="achievement-percentage">\${percentage.toFixed(1)}%</span>
                        </div>
                    \`;
                });
                distributionHTML += '</div>';
            }
            
            subjectDiv.innerHTML = \`
                <div class="subject-header">
                    <h3>\${subject.name}</h3>
                    <span class="credits">\${subject.credits || 0}학점</span>
                </div>
                <div class="average-score">
                    <span class="score">\${subject.average?.toFixed(1) || 'N/A'}</span>
                    <span class="label">평균 점수</span>
                </div>
                \${distributionHTML}
            \`;
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

    displayStudentAnalysis() {
        if (!this.combinedData) return;

        this.populateStudentSelectors();
        const container = document.getElementById('studentTable');
        this.renderStudentTable(this.combinedData.students, this.combinedData.subjects, container);
    }

    populateStudentSelectors() {
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        
        if (!gradeSelect || !classSelect) return;
        
        // 학년 옵션 생성
        const grades = [...new Set(this.combinedData.students.map(s => s.grade).filter(g => g))].sort();
        gradeSelect.innerHTML = '<option value="">전체</option>';
        grades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = grade + '학년';
            gradeSelect.appendChild(option);
        });

        // 반 옵션 생성
        const classes = [...new Set(this.combinedData.students.map(s => s.class).filter(c => c))].sort();
        classSelect.innerHTML = '<option value="">전체</option>';
        classes.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls;
            option.textContent = cls + '반';
            classSelect.appendChild(option);
        });

        this.updateStudentOptions();
    }

    updateClassOptions() {
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        if (!gradeSelect || !classSelect) return;
        
        const selectedGrade = gradeSelect.value;

        let students = this.combinedData.students;
        if (selectedGrade) {
            students = students.filter(s => s.grade == selectedGrade);
        }

        const classes = [...new Set(students.map(s => s.class).filter(c => c))].sort();
        classSelect.innerHTML = '<option value="">전체</option>';
        classes.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls;
            option.textContent = cls + '반';
            classSelect.appendChild(option);
        });
    }

    updateStudentOptions() {
        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentSelect = document.getElementById('studentSelect');
        const studentNameSearch = document.getElementById('studentNameSearch');
        
        if (!studentSelect) return;
        
        const selectedGrade = gradeSelect ? gradeSelect.value : '';
        const selectedClass = classSelect ? classSelect.value : '';
        const nameQuery = (studentNameSearch && studentNameSearch.value ? studentNameSearch.value.trim() : '');

        let students = this.combinedData.students;
        if (selectedGrade) {
            students = students.filter(s => s.grade == selectedGrade);
        }
        if (selectedClass) {
            students = students.filter(s => s.class == selectedClass);
        }
        if (nameQuery) {
            const q = nameQuery.toLowerCase();
            students = students.filter(s => 
                (s.name && s.name.toLowerCase().includes(q)) || 
                (s.originalNumber && String(s.originalNumber).includes(q))
            );
        }

        studentSelect.innerHTML = '<option value="">학생 선택</option>';
        students.forEach(student => {
            const option = document.createElement('option');
            option.value = student.number || student.originalNumber;
            option.textContent = (student.originalNumber || student.number || '') + '번 - ' + (student.name || '');
            studentSelect.appendChild(option);
        });

        const showBtn = document.getElementById('showStudentDetail');
        if (showBtn) {
            showBtn.disabled = students.length !== 1 && !studentSelect.value;
        }
    }

    renderStudentTable(students, subjects, container) {
        if (!container) return;
        
        container.innerHTML = '';

        if (students.length === 0) {
            container.innerHTML = '<p>학생 데이터가 없습니다.</p>';
            return;
        }

        // 테이블 헤더 생성
        const headerRow = ['번호', '이름', '평균등급'];
        subjects.forEach(subject => {
            headerRow.push(subject.name);
        });

        let tableHTML = '<table><thead><tr>';
        headerRow.forEach(header => {
            tableHTML += '<th>' + header + '</th>';
        });
        tableHTML += '</tr></thead><tbody>';

        // 학생 데이터 행 생성
        students.forEach(student => {
            tableHTML += '<tr>';
            tableHTML += '<td>' + (student.originalNumber || student.number || '') + '</td>';
            tableHTML += '<td>' + (student.name || '') + '</td>';
            tableHTML += '<td>' + (student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : '-') + '</td>';
            
            subjects.forEach(subject => {
                const grade = student.grades ? student.grades[subject.name] : '';
                tableHTML += '<td>' + (grade || '-') + '</td>';
            });
            
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }

    filterStudentTable() {
        if (!this.combinedData) return;

        const gradeSelect = document.getElementById('gradeSelect');
        const classSelect = document.getElementById('classSelect');
        const studentSearch = document.getElementById('studentSearch');

        const selectedGrade = gradeSelect ? gradeSelect.value : '';
        const selectedClass = classSelect ? classSelect.value : '';
        const searchTerm = studentSearch ? studentSearch.value.trim().toLowerCase() : '';

        // 학년/반/검색어로 필터링
        let filtered = this.combinedData.students;

        if (selectedGrade) {
            filtered = filtered.filter(s => String(s.grade) === String(selectedGrade));
        }

        if (selectedClass) {
            filtered = filtered.filter(s => String(s.class) === String(selectedClass));
        }

        if (searchTerm) {
            filtered = filtered.filter(s =>
                s.number.toString().includes(searchTerm) ||
                s.name.toLowerCase().includes(searchTerm)
            );
        }

        // 테이블 다시 렌더링
        const container = document.getElementById('studentTable');
        if (container) {
            this.renderStudentTable(filtered, this.combinedData.subjects, container);
        }
    }

    // 뷰 전환 기능
    switchView(viewType) {
        const tableViewBtn = document.getElementById('tableViewBtn');
        const detailViewBtn = document.getElementById('detailViewBtn');
        const tableView = document.getElementById('tableView');
        const detailView = document.getElementById('detailView');

        if (viewType === 'table') {
            if (tableViewBtn) tableViewBtn.classList.add('active');
            if (detailViewBtn) detailViewBtn.classList.remove('active');
            if (tableView) tableView.style.display = 'block';
            if (detailView) detailView.style.display = 'none';
        } else {
            if (tableViewBtn) tableViewBtn.classList.remove('active');
            if (detailViewBtn) detailViewBtn.classList.add('active');
            if (tableView) tableView.style.display = 'none';
            if (detailView) detailView.style.display = 'block';
        }
    }

    // 학생 상세 보기
    showStudentDetail() {
        const studentSelect = document.getElementById('studentSelect');
        const selectedStudentId = studentSelect ? studentSelect.value : '';
        
        if (!selectedStudentId) return;

        const student = this.combinedData.students.find(s => 
            (s.number && s.number == selectedStudentId) || 
            (s.originalNumber && s.originalNumber == selectedStudentId)
        );
        
        if (!student) return;

        this.renderStudentDetail(student);
        this.switchView('detail');
    }

    // 학생 상세 정보 렌더링
    renderStudentDetail(student) {
        const container = document.getElementById('studentDetailContent');
        if (!container) return;
        
        // 평균등급 순위 계산
        const studentsWithGrades = this.combinedData.students.filter(s => s.weightedAverageGrade);
        studentsWithGrades.sort((a, b) => a.weightedAverageGrade - b.weightedAverageGrade);
        
        const studentRank = studentsWithGrades.findIndex(s => s.number === student.number || s.originalNumber === student.originalNumber) + 1;
        const totalGradedStudents = studentsWithGrades.length;
        
        // 같은 등급 학생 수 계산
        const sameGradeStudents = studentsWithGrades.filter(s => 
            Math.abs(s.weightedAverageGrade - student.weightedAverageGrade) < 0.01
        );
        const sameGradeCount = sameGradeStudents.length;

        const html = \`
            <div class="student-detail-header">
                <div class="student-info">
                    <h3>\${student.name || '이름 없음'}</h3>
                    <div class="student-meta">
                        <span class="grade-class">\${student.grade || ''}학년 \${student.class || ''}반 \${student.originalNumber || student.number || ''}번</span>
                        \${student.fileName ? \`<span class="file-info">출처: \${student.fileName}</span>\` : ''}
                    </div>
                </div>
                <div class="overall-stats">
                    <div class="stat-card">
                        <span class="stat-label">평균등급</span>
                        <span class="stat-value grade">\${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">전체 학생수</span>
                        <span class="stat-value">\${totalGradedStudents}명</span>
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
                                    <span class="summary-value">\${student.grade || ''}학년 \${student.class || ''}반 \${student.originalNumber || student.number || ''}번</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">평균등급</span>
                                    <span class="summary-value highlight">\${student.weightedAverageGrade ? student.weightedAverageGrade.toFixed(2) : 'N/A'}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">평균등급(9등급환산)</span>
                                    <span class="summary-value orange">\${this.formatWeightedAverage9GradeDisplay(student, this.combinedData.subjects)}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">등급 순위</span>
                                    <span class="summary-value highlight">\${studentRank}/\${totalGradedStudents}위\${sameGradeCount > 1 ? \` (\${sameGradeCount}명)\` : ''}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">전체 학생수</span>
                                    <span class="summary-value">\${totalGradedStudents}명</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        <h4>교과(군)별 평균등급</h4>
                        <canvas id="studentPercentileChart" width="400" height="400"></canvas>
                    </div>
                </div>

                <div class="subject-details">
                    <h4>과목별 상세 분석</h4>
                    <div class="subject-cards">
                        \${this.renderSubjectCards(student)}
                    </div>
                </div>
            </div>
        \`;
        
        container.innerHTML = html;
        
        // 학생 차트 생성
        setTimeout(() => {
            this.createStudentPercentileChart(student);
        }, 100);
    }

    // 과목별 카드 렌더링
    renderSubjectCards(student) {
        if (!student.grades || !this.combinedData.subjects) return '';
        
        return this.combinedData.subjects.map(subject => {
            const grade = student.grades[subject.name];
            if (!grade) return '';
            
            // 해당 과목에서의 순위 계산
            const subjectStudents = this.combinedData.students
                .filter(s => s.grades && s.grades[subject.name])
                .sort((a, b) => a.grades[subject.name] - b.grades[subject.name]);
            
            const subjectRank = subjectStudents.findIndex(s => 
                (s.number === student.number || s.originalNumber === student.originalNumber)
            ) + 1;
            
            return \`
                <div class="subject-card detailed">
                    <div class="subject-header">
                        <h5>\${subject.name}</h5>
                        <div class="subject-grade grade-\${Math.ceil(grade)}">\${grade}등급</div>
                    </div>
                    <div class="subject-stats">
                        <div class="stat-item">
                            <span class="stat-label">등급</span>
                            <span class="stat-value">\${grade}등급</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">과목내 순위</span>
                            <span class="stat-value">\${subjectRank}/\${subjectStudents.length}위</span>
                        </div>
                    </div>
                </div>
            \`;
        }).filter(card => card).join('');
    }

    // 산점도 차트 생성
    createScatterChart(students) {
        const ctx = document.getElementById('scatterChart');
        if (!ctx) return;
        
        const canvas = ctx.getContext ? ctx.getContext('2d') : null;
        if (!canvas) return;
        
        // 기존 차트가 있다면 파괴 및 동일 캔버스 잔존 차트 제거
        try { if (this.scatterChart) this.scatterChart.destroy(); } catch(_) {}
        try {
            const existing = (Chart.getChart ? Chart.getChart(canvas.canvas) : (canvas.canvas && (canvas.canvas._chart || canvas.canvas.chart)));
            if (existing && typeof existing.destroy === 'function') existing.destroy();
        } catch (_) {}

        // 평균등급별로 학생을 정렬
        const sortedStudents = [...students].sort((a, b) => a.weightedAverageGrade - b.weightedAverageGrade);
        
        // 각 평균등급별로 같은 등급의 학생 수만큼 Y축에 분산
        const gradeGroups = {};
        students.forEach(student => {
            const grade = student.weightedAverageGrade.toFixed(2);
            if (!gradeGroups[grade]) {
                gradeGroups[grade] = [];
            }
            gradeGroups[grade].push(student);
        });

        // 산점도 데이터 생성
        const scatterData = [];
        const colors = ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#3498db'];
        
        Object.keys(gradeGroups).forEach(grade => {
            const studentsInGrade = gradeGroups[grade];
            studentsInGrade.forEach((student, index) => {
                const gradeNum = parseFloat(grade);
                const colorIndex = Math.min(Math.floor(gradeNum), 4);
                scatterData.push({
                    x: gradeNum,
                    y: index + 1,
                    backgroundColor: colors[colorIndex],
                    borderColor: colors[colorIndex],
                    studentName: student.name
                });
            });
        });

        this.scatterChart = new Chart(canvas, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '학생 분포',
                    data: scatterData,
                    backgroundColor: scatterData.map(d => d.backgroundColor),
                    borderColor: scatterData.map(d => d.borderColor),
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return point.studentName + ': ' + point.x + '등급';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: '평균등급'
                        },
                        min: 1,
                        max: 5,
                        reverse: false
                    },
                    y: {
                        title: {
                            display: true,
                            text: '학생 수'
                        },
                        min: 0,
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // 등급 분포 막대차트 생성
    createGradeDistributionChart(students) {
        const ctx = document.getElementById('barChart');
        if (!ctx) return;
        
        const canvas = ctx.getContext ? ctx.getContext('2d') : null;
        if (!canvas) return;
        
        // 기존 차트가 있다면 파괴 및 동일 캔버스 잔존 차트 제거
        try { if (this.barChart) this.barChart.destroy(); } catch(_) {}
        try {
            const existing = (Chart.getChart ? Chart.getChart(canvas.canvas) : (canvas.canvas && (canvas.canvas._chart || canvas.canvas.chart)));
            if (existing && typeof existing.destroy === 'function') existing.destroy();
        } catch (_) {}

        // 등급별 구간 정의
        const gradeRanges = [
            { label: '1.0-1.5', min: 1.0, max: 1.5, color: '#e74c3c' },
            { label: '1.5-2.0', min: 1.5, max: 2.0, color: '#e67e22' },
            { label: '2.0-2.5', min: 2.0, max: 2.5, color: '#f39c12' },
            { label: '2.5-3.0', min: 2.5, max: 3.0, color: '#f1c40f' },
            { label: '3.0-3.5', min: 3.0, max: 3.5, color: '#2ecc71' },
            { label: '3.5-4.0', min: 3.5, max: 4.0, color: '#27ae60' },
            { label: '4.0-4.5', min: 4.0, max: 4.5, color: '#3498db' },
            { label: '4.5-5.0', min: 4.5, max: 5.0, color: '#2980b9' }
        ];

        const rangeCounts = gradeRanges.map(range => {
            return students.filter(student => 
                student.weightedAverageGrade >= range.min && 
                student.weightedAverageGrade < range.max
            ).length;
        });

        this.barChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: gradeRanges.map(range => range.label),
                datasets: [{
                    label: '학생 수',
                    data: rangeCounts,
                    backgroundColor: gradeRanges.map(range => range.color),
                    borderColor: gradeRanges.map(range => range.color),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '학생 수'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '평균등급 구간'
                        }
                    }
                }
            }
        });
    }

    // 학생 레이더 차트 생성
    createStudentPercentileChart(student) {
        const ctx = document.getElementById('studentPercentileChart');
        if (!ctx) return;
        
        const canvas = ctx.getContext ? ctx.getContext('2d') : null;
        if (!canvas) return;
        
        // 기존 차트 제거 및 동일 캔버스의 잔존 차트 제거
        try { if (this.studentPercentileChart) this.studentPercentileChart.destroy(); } catch(_) {}
        try {
            const existing = (Chart.getChart ? Chart.getChart(canvas.canvas) : (canvas.canvas && (canvas.canvas._chart || canvas.canvas.chart)));
            if (existing && typeof existing.destroy === 'function') existing.destroy();
        } catch (_) {}

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
        const gradeData = subjects.map(subject => {
            const grade = student.grades[subject.name];
            return grade ? (6 - grade) : 0; // 등급을 역산하여 높을수록 좋게
        });

        this.studentPercentileChart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    label: '등급',
                    data: gradeData,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(52, 152, 219, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(52, 152, 219, 1)'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    r: {
                        angleLines: {
                            display: true
                        },
                        grid: {
                            circular: true
                        },
                        pointLabels: {
                            display: true,
                            centerPointLabels: true,
                            font: {
                                size: 12
                            }
                        },
                        ticks: {
                            display: true,
                            stepSize: 1,
                            min: 0,
                            max: 5,
                            callback: function(value) {
                                return (6 - value) + '등급';
                            }
                        }
                    }
                }
            }
        });
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    new StandaloneScoreAnalyzer();
});
        `;
    }
}

// 전역 변수로 선언
let scoreAnalyzer;

// 페이지 로드 시 분석기 초기화
document.addEventListener('DOMContentLoaded', () => {
    scoreAnalyzer = new ScoreAnalyzer();
});
