// Google Sheets APIを使ってデータを取得する関数（CSV形式で全データ取得）

export const fetchSheetData = async (spreadsheetUrl, sheetName, range = '') => {
  try {
    // スプレッドシートIDを抽出
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)

    if (!spreadsheetId) {
      throw new Error('無効なスプレッドシートURLです')
    }

    // シート名からgidを取得する必要があるため、まずgviz APIで取得を試みる
    // CSV形式でエクスポート: /export?format=csv&gid=SHEET_GID
    // gidが不明な場合は、最初のシート(gid=0)を使用

    // まずgviz APIでシート情報を取得
    const apiUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`

    const response = await fetch(apiUrl)
    const text = await response.text()

    // Google APIのレスポンスから JSONを抽出
    const jsonString = text.substring(47, text.length - 2)
    const data = JSON.parse(jsonString)

    // データを整形して返す
    const parsedData = parseGoogleSheetsData(data)

    console.log(`fetchSheetData - ${sheetName}: got ${parsedData.length} rows from gviz API`)

    // もし6行以下しか取れていない場合は、CSVエクスポートを試みる
    if (parsedData.length <= 7) {  // ヘッダー含めて7行以下
      console.warn(`Only ${parsedData.length} rows from gviz, trying CSV export...`)

      // まずシート名を使ってCSVエクスポートを試みる（シート名指定）
      try {
        const csvUrlWithSheet = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
        const csvResponse = await fetch(csvUrlWithSheet)
        const csvText = await csvResponse.text()
        const csvData = parseCSV(csvText)
        console.log(`CSV export (with sheet name): got ${csvData.length} rows`)
        if (csvData.length > 7) {
          return csvData
        }
      } catch (csvError) {
        console.warn('CSV export with sheet name failed:', csvError)
      }

      // それでもダメならgid=0で試す
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`
        const csvResponse = await fetch(csvUrl)
        const csvText = await csvResponse.text()
        const csvData = parseCSV(csvText)
        console.log(`CSV export (gid=0): got ${csvData.length} rows`)
        if (csvData.length > parsedData.length) {
          return csvData
        }
      } catch (csvError) {
        console.warn('CSV export with gid=0 failed:', csvError)
      }

      console.warn('All CSV export attempts failed, using gviz data')
      return parsedData
    }

    return parsedData
  } catch (error) {
    console.error('Error fetching sheet data:', error)
    throw error
  }
}

// スプレッドシートIDを抽出
const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

// Google Sheetsのデータを解析
const parseGoogleSheetsData = (data) => {
  if (!data.table || !data.table.rows) {
    return []
  }

  const rows = data.table.rows
  const parsedData = []

  rows.forEach(row => {
    if (row.c) {
      const rowData = row.c.map(cell => {
        if (!cell) return null
        return cell.v !== null ? cell.v : null
      })
      parsedData.push(rowData)
    }
  })

  return parsedData
}

// CSVテキストをパースする関数
const parseCSV = (csvText) => {
  const lines = csvText.split('\n')
  const result = []

  lines.forEach(line => {
    if (line.trim()) {
      // 簡易的なCSVパース（カンマ区切り、ダブルクォート対応）
      const row = []
      let currentCell = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          row.push(currentCell.trim())
          currentCell = ''
        } else {
          currentCell += char
        }
      }
      row.push(currentCell.trim())
      result.push(row)
    }
  })

  return result
}

// テキスト評価を数値に変換
export const convertEvaluationToNumber = (text) => {
  if (!text) return 0

  const textStr = String(text).trim()

  if (textStr === '出来ていた') return 1.0
  if (textStr === 'やや出来ていた') return 0.7
  if (textStr === 'やや出来ていない') return 0.3
  if (textStr === '出来なかった') return 0.0
  if (textStr === '対象外') return 0.0
  if (textStr === '管理部門対象外') return 0.0

  return 0
}

// データを構造化されたオブジェクトに変換
export const convertToStructuredData = (rawData, type) => {
  if (!rawData || rawData.length === 0) {
    return []
  }

  console.log(`convertToStructuredData - type: ${type}, rawData length: ${rawData.length}`)

  if (type === 'sales') {
    // 売上・利益データの変換
    // 想定: [氏名, 部署, 年度, 売上, 利益]
    const headers = rawData[0]
    return rawData.slice(1).map(row => ({
      name: row[0],
      department: row[1],
      year: row[2],
      sales: parseFloat(row[3]) || 0,
      profit: parseFloat(row[4]) || 0
    }))
  } else if (type === 'evaluationMaster') {
    // 評価マスターデータの変換
    // ヘッダー行（1行目）から列インデックスを特定する
    if (rawData.length < 2) return []

    const headers = rawData[0].map(h => String(h).trim())

    // 列の特定（柔軟に検索）
    const findIndex = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)))

    const idx = {
      categoryNo: findIndex(['大項目番号', 'No', 'CategoryNo']),
      major: findIndex(['大項目', '大カテゴリ', 'Major']),
      minor: findIndex(['中項目', '中カテゴリ', 'Minor']),
      criteria: findIndex(['審査内容', '評価基準', '内容', 'Criteria']),
      questionNo: findIndex(['設問番号', '質問番号', 'QuestionNo', 'No.'])
    }

    // 4. ユーザー提供の特定フォーマット (No., 項目, ..., 審査内容)
    // ヘッダー行の検出
    const headerRowIndex = rawData.findIndex(row =>
      row.some(cell => String(cell).includes('審査内容') || String(cell).includes('項目'))
    )

    if (headerRowIndex !== -1) {
      const headerRow = rawData[headerRowIndex]
      // カラムインデックスの特定
      const colMap = {
        categoryNo: 0, // No.
        majorCategory: 1, // 項目
        majorDesc: null, // 説明（デフォルトはnull）
        minorCategory: 3, // (3列目にあると仮定)
        criteria: 4 // 審査内容
      }

      // ヘッダーから動的に特定を試みる
      headerRow.forEach((cell, idx) => {
        const text = String(cell).trim()
        if (text === 'No.' || text === 'カテゴリー') colMap.categoryNo = idx
        if (text === '項目' || text === '大カテゴリ') colMap.majorCategory = idx

        // 説明カラムの特定（ヘッダーに「説明」や「補足」が含まれる場合）
        if (text.includes('説明') || text.includes('補足')) colMap.majorDesc = idx

        if (text === '審査内容') colMap.criteria = idx

        // minorCategoryはヘッダーがない場合が多いので、majorとcriteriaの間にあると推測
        // ただし、majorDescが見つかっていない場合、majorの隣がminorの可能性もあるため、慎重に
        if (idx > colMap.majorCategory && idx < colMap.criteria && String(rawData[headerRowIndex + 2]?.[idx] || '').length > 0) {
          // 既存のロジック：majorとcriteriaの間にある列をminorとする
          // もしmajorDescが見つかっておらず、かつこの列がmajorの直後なら、ここがminorの可能性が高い
          // ユーザーのシート構造が [No, Major, Minor, Criteria] の場合、idx=2はMinor
          colMap.minorCategory = idx
        }
      })

      console.log('Detected User Format:', colMap)

      let currentCategoryNo = ''
      let currentMajorCategory = ''
      let currentMajorDesc = ''
      let currentMinorCategory = ''
      let questionCounter = 1

      // データ行はヘッダーの2行後から開始（CSVの構造上）
      const startRow = headerRowIndex + 1

      for (let i = startRow; i < rawData.length; i++) {
        const row = rawData[i]
        if (row.length < 5) continue

        // 値の取得
        const catNoVal = String(row[colMap.categoryNo] || '').trim()
        const majorVal = String(row[colMap.majorCategory] || '').trim()
        const majorDescVal = colMap.majorDesc !== null ? String(row[colMap.majorDesc] || '').trim() : ''
        const minorVal = String(row[colMap.minorCategory] || '').trim()
        const criteriaVal = String(row[colMap.criteria] || '').trim()

        // 結合セルの保管（空なら前の値を継承）
        if (catNoVal) currentCategoryNo = catNoVal

        // タイトルと説明の分離ロジック
        let tempMajor = majorVal
        let tempDesc = majorDescVal

        // 説明が空で、タイトルに改行や「が含まれる場合、分割を試みる
        if (!tempDesc && tempMajor) {
          const strMajor = String(tempMajor)
          if (strMajor.includes('\n')) {
            const parts = strMajor.split('\n')
            tempMajor = parts[0].trim()
            tempDesc = parts.slice(1).join('\n').trim()
          } else {
            // 括弧での分割を試みる（優先順位: 「, ｢, 【, [, (, （）
            const brackets = ['「', '｢', '【', '[', '(', '（']
            let splitIdx = -1

            for (const bracket of brackets) {
              const idx = strMajor.indexOf(bracket)
              if (idx > 0) { // 先頭でない場合のみ分割
                splitIdx = idx
                break
              }
            }

            if (splitIdx > 0) {
              tempDesc = strMajor.substring(splitIdx).trim()
              tempMajor = strMajor.substring(0, splitIdx).trim()
            }
          }
        }

        if (tempMajor) currentMajorCategory = tempMajor
        if (tempDesc) currentMajorDesc = tempDesc
        if (minorVal) currentMinorCategory = minorVal

        // 審査内容がある行を有効なデータとする
        if (criteriaVal && criteriaVal !== '審査内容') {
          structuredData.push({
            id: questionCounter, // 連番IDを付与
            questionNo: questionCounter,
            categoryNo: currentCategoryNo,
            majorCategory: currentMajorCategory,
            majorCategoryDesc: currentMajorDesc,
            minorCategory: currentMinorCategory,
            criteria: criteriaVal
          })
          questionCounter++
        }
      }

      if (structuredData.length > 0) return structuredData
    }

    // デフォルト値（見つからない場合は旧仕様のインデックスを使用）
    // ヘッダーが見つからない場合、データの中身から推測する
    if (idx.questionNo === -1) {
      // 1行目のデータを確認
      const firstRow = rawData[0]
      // パターンA: [CatNo, QNo, MajorTitle, MajorDesc, Minor, Criteria]
      // ユーザーのデータ: [1, 1, "経営...", "「業績...", "財務...", "●..."]
      if (typeof firstRow[1] === 'number' && typeof firstRow[2] === 'string') {
        console.log('Detected headerless format (Pattern A - with Description)')
        idx.categoryNo = 0
        idx.questionNo = 1
        idx.major = 2
        // 3列目は大項目の説明だが、majorCategoryに含めるか、別途扱うか
        // ここではMajorCategoryとして結合する
        idx.majorDesc = 3
        idx.minor = 4
        idx.criteria = 5
      } else {
        // 旧デフォルト
        idx.categoryNo = 0
        idx.major = 1
        idx.minor = 3
        idx.criteria = 4
        idx.questionNo = 5
      }
    } else {
      // ヘッダーが見つかった場合のデフォルト補完
      if (idx.categoryNo === -1) idx.categoryNo = 0
      if (idx.major === -1) idx.major = 1
      if (idx.minor === -1) idx.minor = 3
      if (idx.criteria === -1) idx.criteria = 4
    }

    console.log('Final column indices:', idx)

    // 前行の値を保持する変数（結合セル対策）
    let lastCategoryNo = null
    let lastMajor = ''
    let lastMajorDesc = '' // 追加
    let lastMinor = ''

    // データをオブジェクト配列に変換
    return rawData
      .filter(row => {
        // ヘッダー行を除外
        if (row === rawData[0] && idx.questionNo !== -1 && typeof row[idx.questionNo] === 'string' && row[idx.questionNo].includes('No')) return false

        // 設問番号がある、または結合セルの続き（設問番号がnullでもCriteriaがあれば）
        // 今回は設問番号が必須とするが、結合セルの場合はCategoryNoなどが空の可能性がある
        const criteria = row[idx.criteria] || row[4] // フォールバック
        return criteria // 審査内容があれば有効な行とみなす
      })
      .map(row => {
        // 結合セルの処理（値が空なら前の行の値を使う）
        const currentCategoryNo = row[idx.categoryNo]
        const currentMajor = row[idx.major]
        const currentMajorDesc = idx.majorDesc ? row[idx.majorDesc] : ''
        const currentMinor = row[idx.minor]

        // CategoryNo
        if (currentCategoryNo !== null && currentCategoryNo !== undefined && currentCategoryNo !== '') {
          lastCategoryNo = currentCategoryNo
        }

        // MajorCategory (タイトル + 説明)
        // 変更: タイトルと説明を分ける
        let majorTitle = currentMajor
        let majorDesc = ''

        if (currentMajorDesc) {
          majorDesc = currentMajorDesc
        }

        // タイトルと説明の分離ロジック（デフォルトパス）
        if (!majorDesc && majorTitle) {
          const strMajor = String(majorTitle)
          if (strMajor.includes('\n')) {
            const parts = strMajor.split('\n')
            majorTitle = parts[0].trim()
            majorDesc = parts.slice(1).join('\n').trim()
          } else {
            // 括弧での分割を試みる
            const brackets = ['「', '｢', '【', '[', '(', '（']
            let splitIdx = -1

            for (const bracket of brackets) {
              const idx = strMajor.indexOf(bracket)
              if (idx > 0) {
                splitIdx = idx
                break
              }
            }

            if (splitIdx > 0) {
              majorDesc = strMajor.substring(splitIdx).trim()
              majorTitle = strMajor.substring(0, splitIdx).trim()
            }
          }
        }

        if (majorTitle && majorTitle.trim() !== '') {
          lastMajor = majorTitle
          // 説明も保持する必要があるが、lastMajorに含めると結合されてしまう
          // ここではlastMajorはタイトルのみとする
        }

        // 説明の保持（行結合のロジック上、前の行の説明を保持する必要があるか？）
        // 簡易的に、現在の行に説明があればそれを使い、なければ空とする（結合セルの場合、タイトルは継承されるが説明は？）
        // 通常、結合セルなら説明も同じセル範囲に含まれるはず
        // しかし、行ごとに処理しているため、タイトルがnullなら前のタイトルを使うのと同様、説明も前の説明を使うべき

        // lastMajorDesc変数を追加して管理する
        if (currentMajorDesc && String(currentMajorDesc).trim() !== '') {
          lastMajorDesc = currentMajorDesc
        } else if (currentMajor && String(currentMajor).trim() !== '') {
          // タイトルが新しくなったのに説明がない場合、説明をリセットすべきか？
          // 結合セルの場合、タイトルがある行に説明もあるはず。
          // タイトルがある行で説明が空なら、説明なしの項目ということ。
          lastMajorDesc = ''
        }

        // MinorCategory
        if (currentMinor && currentMinor.trim() !== '') {
          lastMinor = currentMinor
        }

        // 設問番号は各行に必須と仮定（なければ連番などを振るべきだが、一旦そのまま）
        const qNo = row[idx.questionNo]

        return {
          categoryNo: lastCategoryNo,
          majorCategory: lastMajor,
          majorCategoryDesc: lastMajorDesc, // 追加
          minorCategory: lastMinor,
          criteria: row[idx.criteria],
          questionNo: parseInt(qNo) || 0 // 設問番号がない場合は0（表示時に注意）
        }
      })
  } else if (type === 'selfEvaluation' || type === 'managerEvaluation') {
    // 自己評価・部長評価フォーム回答の変換
    // 構造: タイムスタンプ, 氏名, 部署, 設問1回答, 設問2回答, ...
    return rawData.slice(1).map(row => ({
      timestamp: row[0],
      name: row[1],
      department: row[2],
      answers: row.slice(3) // D列以降が回答
    }))
  } else if (type === 'totalScore') {
    // 合計評価点の変換
    // 構造: B列=氏名, FN列(170列目)=合計評価点
    return rawData.slice(1).map(row => ({
      name: row[1], // B列
      totalScore: parseFloat(row[169]) || 0 // 170列目 (0-indexed で 169)
    }))
  }

  return rawData
}

// 4つのシートをマージして評価データを生成
export const mergeEvaluationData = (masterData, selfData, managerData, scoreData) => {
  const employees = {}

  // 自己評価データを集約
  selfData.forEach(item => {
    if (!employees[item.name]) {
      employees[item.name] = {
        name: item.name,
        department: item.department,
        selfAnswers: item.answers,
        managerAnswers: [],
        totalScore: 0
      }
    } else {
      employees[item.name].selfAnswers = item.answers
    }
  })

  // 部長評価データを追加
  managerData.forEach(item => {
    if (!employees[item.name]) {
      employees[item.name] = {
        name: item.name,
        department: item.department,
        selfAnswers: [],
        managerAnswers: item.answers,
        totalScore: 0
      }
    } else {
      employees[item.name].managerAnswers = item.answers
    }
  })

  // 合計評価点を追加
  scoreData.forEach(item => {
    if (employees[item.name]) {
      employees[item.name].totalScore = item.totalScore
    }
  })

  return employees
}
