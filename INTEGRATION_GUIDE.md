# 인쇄용 성적표 양식 파서 통합 가이드

## 개요

NEIS 「학기말성적종합일람표」의 **XLS data** 양식 외에,  
**인쇄용 성적표 양식** (행 단위, 페이지 넘김 포함)을 자동 감지하여 파싱합니다.

---

## 적용 방법 (script.js 수정 2곳)

### 수정 ①: `parseFileData` 시작 부분 (양식 감지 분기 추가)

**파일 위치**: script.js 약 291행 부근  
**검색어**: `parseFileData(data, fileName) {`

```diff
  parseFileData(data, fileName) {
+     // ★ 양식 자동감지: 인쇄용 성적표 양식이면 별도 파서 사용
+     const format = this.detectFileFormat(data);
+     if (format === 'grade-report') {
+         console.log(`[${fileName}] 인쇄용 성적표 양식 감지`);
+         return this.parseGradeReport(data, fileName);
+     }
+
      const fileData = {
          fileName: fileName,
```

### 수정 ②: 새 메서드 7개 삽입

**파일 위치**: `parseAchievementDistribution` 메서드 닫는 `}` 바로 다음  
**검색어**: `parseStudentData(data, fileData) {` 바로 **위**

→ `patch_gradeReport.js` 파일의 내용 전체를 이 위치에 삽입

---

## 새 메서드 목록

| 메서드 | 역할 |
|--------|------|
| `detectFileFormat(data)` | 업로드된 엑셀이 XLS data인지 인쇄용 양식인지 자동 판별 |
| `parseGradeReport(data, fileName)` | 인쇄용 양식 전체 파싱 (VBA maketemp 로직 재현) |
| `_buildGradeReportColumnMap(headerRow)` | 4행 헤더에서 열 인덱스 자동 매핑 |
| `_isGradeReportHeaderRow(row, colMap)` | 페이지 넘김으로 반복되는 헤더행 판별 |
| `_grVal(row, colMap, field)` | 셀 값 읽기 유틸리티 |
| `_parseAchievementDistString(str)` | "A(6.3)B(15.3)..." 형식 성취도 분포 파싱 |

---

## VBA maketemp 로직 대응표

| VBA 로직 | JS 구현 |
|----------|---------|
| `번호열.Offset(i) <> ""` → carry-forward | `curNumber`, `curName` 변수로 이전 값 유지 |
| `번호열.Offset(i, 2)` → 학년 carry-forward | `curSchoolYear` 변수 |
| `번호열.Offset(i, 3)` → 학기 carry-forward | `curSemester` 변수 |
| `예체능트리거` / `진로선택트리거` | `is예체능` / `is진로선택` boolean |
| `IsNumeric(단위수열.Offset(i))` | `!isNaN(parseFloat(credits))` |
| `Split(단위수열.Offset(i, 1), "/")` | `rawStr.split('/')` (복합형식 지원) |
| `Left(성취도열.Offset(i), 1)` | `.charAt(0)` |
| `성취도열.Offset(i, -1)` (예체능) | `row[colMap.achievement - 1]` |

---

## 지원하는 열 구조

자동 매핑이므로 열 순서가 약간 달라도 동작합니다.  
최소 필수 열: **번호, 과목명(또는 과목), 학점(또는 단위수)**

| 열 | 필수 | 설명 |
|----|------|------|
| 번호 | ✅ | 학생 번호 (변경 시에만 표시) |
| 성명 | ✅ | 학생 이름 (변경 시에만 표시) |
| 학년 | ○ | 몇 학년 성적인지 (carry-forward) |
| 학기 | ○ | 학기 (carry-forward) |
| 교과 | ○ | 교과(군) |
| 과목명 | ✅ | 과목 이름 |
| 학점 | ✅ | 단위수 |
| 원점수 | ○ | 원점수 (단독 또는 "점수/평균" 복합형식) |
| 과목평균 | ○ | 과목 평균 (별도 열 또는 복합형식에서 추출) |
| 성취도 | ○ | A/B/C/D/E |
| 성취도별 분포비율 | ○ | "A(6.3)B(15.3)..." 형식 |
| 석차등급 | ○ | 1~9 등급 |
| 수강자수 | ○ | 수강 인원 |

---

## 주의사항

- 인쇄용 양식의 **페이지 넘김으로 삽입되는 반복 헤더행**은 자동으로 건너뜁니다.
- **`<체육ㆍ예술>`**, **`<진로 선택 과목>`** 등 섹션 마커를 감지하여  
  예체능 과목은 석차등급·수강자수 없이 성취도만 기록합니다.
- 기존 XLS data 양식과 **혼합 업로드**해도 자동 감지하여 각각 올바르게 파싱합니다.
