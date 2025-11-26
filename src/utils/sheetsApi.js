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

        if (idx > colMap.majorCategory && idx < colMap.criteria && String(rawData[headerRowIndex + 2]?.[idx] || '').length > 0) {
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
        if (majorVal) currentMajorCategory = majorVal
        if (majorDescVal) currentMajorDesc = majorDescVal
        if (minorVal) currentMinorCategory = minorVal
      }
    }

    return rawData.slice(1).filter(row => row.length >= 5).map(row => ({
      categoryNo: row[idx.categoryNo],
      majorCategory: row[idx.major],
      minorCategory: row[idx.minor],
      criteria: row[idx.criteria],
      questionNo: parseInt(row[idx.questionNo]) || 0
    }))
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

// ============================================
// 売上ランキングデータの変換（大幅改良版）
// ============================================

// 数値文字列をパースするヘルパー関数
const parseNumericString = (str) => {
  if (typeof str === 'number') return str
  if (!str) return 0
  // 全角・半角の円記号、カンマ、パーセント、空白を削除
  const cleanStr = str.toString().replace(/[¥￥,%％\s　]/g, '')
  const num = parseFloat(cleanStr)
  return isNaN(num) ? 0 : num
}

// 順位文字列から数値を抽出（「1位」→ 1）
const parseRankString = (str) => {
  if (typeof str === 'number') return str
  if (!str) return 0
  const match = String(str).match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

// セルが有効な氏名かどうかを判定
const isValidName = (cell) => {
  if (!cell) return false
  const str = String(cell).trim()
  // 空、数値のみ、記号のみ、ヘッダー的な文字列は除外
  if (str === '') return false
  if (/^[\d,.\s¥￥%％位]+$/.test(str)) return false
  if (['売上ランキング', '粗利ランキング', '氏名', '売上額', '全体内%', '部内%', '部内％', '全体内％', '粗利額', '順位'].includes(str)) return false
  // 部署名っぽいものも除外
  if (['東京', '大阪', '名古屋', '畠山部', '全体', '合計'].includes(str)) return false
  // 2文字以上の日本語または英字を含む
  return str.length >= 2
}

// ヘッダー行を検出する関数
const findRankingHeaderRow = (rawData) => {
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row) continue
    
    // 「売上ランキング」と「氏名」と「売上額」を含む行を探す
    const rowText = row.map(cell => String(cell || '').trim())
    const hasRanking = rowText.some(t => t === '売上ランキング' || t.includes('ランキング'))
    const hasName = rowText.some(t => t === '氏名')
    const hasSales = rowText.some(t => t === '売上額' || t === '売上高')
    
    if (hasRanking && hasName && hasSales) {
      return i
    }
  }
  return -1
}

// 列インデックスを動的に検出
const detectColumnIndices = (headerRow) => {
  const indices = {
    rank: -1,
    name: -1,
    sales: -1,
    share: -1
  }
  
  if (!headerRow) return indices
  
  headerRow.forEach((cell, idx) => {
    const text = String(cell || '').trim()
    if (text === '売上ランキング' || text === '順位' || text.includes('ランキング')) {
      indices.rank = idx
    }
    if (text === '氏名') {
      indices.name = idx
    }
    if (text === '売上額' || text === '売上高') {
      indices.sales = idx
    }
    if (text === '全体内%' || text === '全体内％' || text === '部内%' || text === '部内％' || text.includes('内%') || text.includes('内％')) {
      indices.share = idx
    }
  })
  
  return indices
}

// 「全体」シート用：個人ランキングセクションを抽出
const extractPersonalRanking = (rawData, sheetName) => {
  const results = []
  
  // 「全体」の個人ランキングを探す（行23あたりから始まる）
  // 特徴：「売上ランキング」「氏名」「売上額」「全体内％」のヘッダー行の後に
  // 「1位」「丸岡 広樹」のような個人データが続く
  
  let inPersonalSection = false
  let headerIndices = { rank: -1, name: -1, sales: -1, share: -1 }
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row) continue
    
    const rowText = row.map(cell => String(cell || '').trim())
    
    // ヘッダー行を検出（個人ランキングセクション）
    const hasRanking = rowText.some(t => t === '売上ランキング')
    const hasName = rowText.some(t => t === '氏名')
    const hasSales = rowText.some(t => t === '売上額')
    
    if (hasRanking && hasName && hasSales) {
      // 次のデータ行をチェックして、個人名かどうか確認
      const nextRow = rawData[i + 1]
      if (nextRow) {
        const nextRowText = nextRow.map(cell => String(cell || '').trim())
        // 「1位」で始まり、次が個人名（部署名ではない）なら個人ランキング
        const hasFirstRank = nextRowText.some(t => t === '1位' || t === '1')
        const potentialName = nextRowText.find(t => isValidName(t))
        
        if (hasFirstRank && potentialName) {
          inPersonalSection = true
          headerIndices = detectColumnIndices(row)
          console.log(`[Debug] ${sheetName}: Found personal ranking header at row ${i + 1}`, headerIndices)
          continue
        }
      }
    }
    
    // 個人ランキングセクション内のデータを処理
    if (inPersonalSection) {
      const rankCell = headerIndices.rank >= 0 ? row[headerIndices.rank] : null
      const nameCell = headerIndices.name >= 0 ? row[headerIndices.name] : null
      const salesCell = headerIndices.sales >= 0 ? row[headerIndices.sales] : null
      const shareCell = headerIndices.share >= 0 ? row[headerIndices.share] : null
      
      // 空行や合計行で終了
      if (!rankCell && !nameCell && !salesCell) {
        // 連続空行でセクション終了
        inPersonalSection = false
        continue
      }
      
      // 合計行をスキップ
      if (String(nameCell || '').includes('合計')) {
        continue
      }
      
      // 有効な個人データを追加
      if (isValidName(nameCell)) {
        results.push({
          rank: parseRankString(rankCell),
          name: String(nameCell).trim(),
          sales: parseNumericString(salesCell),
          share: parseNumericString(shareCell),
          profit: 0,
          achievement: 0,
          yoy: 0,
          department: sheetName
        })
      }
    }
  }
  
  return results
}

// 部署シート用：すべてのランキングセクションを抽出
const extractAllRankings = (rawData, sheetName) => {
  const results = []
  const seen = new Set() // 重複チェック用
  
  let currentHeaderIndices = null
  let collectingData = false
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row) continue
    
    const rowText = row.map(cell => String(cell || '').trim())
    
    // ヘッダー行を検出
    const hasRanking = rowText.some(t => t === '売上ランキング')
    const hasName = rowText.some(t => t === '氏名')
    const hasSales = rowText.some(t => t === '売上額' || t === '売上高')
    
    if (hasRanking && hasName && hasSales) {
      currentHeaderIndices = detectColumnIndices(row)
      collectingData = true
      console.log(`[Debug] ${sheetName}: Found ranking header at row ${i + 1}`, currentHeaderIndices)
      continue
    }
    
    // データ収集中
    if (collectingData && currentHeaderIndices) {
      const rankCell = currentHeaderIndices.rank >= 0 ? row[currentHeaderIndices.rank] : null
      const nameCell = currentHeaderIndices.name >= 0 ? row[currentHeaderIndices.name] : null
      const salesCell = currentHeaderIndices.sales >= 0 ? row[currentHeaderIndices.sales] : null
      const shareCell = currentHeaderIndices.share >= 0 ? row[currentHeaderIndices.share] : null
      
      // 空行でデータ収集終了
      const isEmptyRow = rowText.every(t => t === '' || t === null)
      if (isEmptyRow) {
        collectingData = false
        currentHeaderIndices = null
        continue
      }
      
      // 合計行をスキップ
      if (String(nameCell || '').includes('合計')) {
        continue
      }
      
      // 有効な個人データを追加（重複除外）
      if (isValidName(nameCell)) {
        const name = String(nameCell).trim()
        if (!seen.has(name)) {
          seen.add(name)
          results.push({
            rank: parseRankString(rankCell),
            name: name,
            sales: parseNumericString(salesCell),
            share: parseNumericString(shareCell),
            profit: 0,
            achievement: 0,
            yoy: 0,
            department: sheetName
          })
        }
      }
    }
  }
  
  return results
}

// 売上ランキングデータの変換（メイン関数）
export const convertSalesRankingData = (rawData, sheetName) => {
  console.log(`convertSalesRankingData called for sheet: ${sheetName}`)

  if (!rawData || rawData.length < 2) {
    console.log(`Returning empty array - insufficient data`)
    return []
  }

  let result = []
  
  if (sheetName === '全体') {
    // 全体シートは個人ランキングのみを抽出
    result = extractPersonalRanking(rawData, sheetName)
  } else {
    // 部署シートはすべてのランキングを抽出
    result = extractAllRankings(rawData, sheetName)
  }
  
  // 順位でソート
  result.sort((a, b) => a.rank - b.rank)
  
  console.log(`convertSalesRankingData result for ${sheetName}: ${result.length} records`)
  if (result.length > 0) {
    console.log(`[Debug] ${sheetName} first record:`, result[0])
    console.log(`[Debug] ${sheetName} last record:`, result[result.length - 1])
  }

  return result
}

// 複数シートから売上データを読み込む
export const fetchAllSalesSheets = async (spreadsheetUrl) => {
  const sheetNames = ['全体', '東京', '大阪', '名古屋', '畠山部']

  try {
    // 全シートを並行して読み込み
    const results = await Promise.all(
      sheetNames.map(async (sheetName) => {
        try {
          const rawData = await fetchSheetData(spreadsheetUrl, sheetName)
          const convertedData = convertSalesRankingData(rawData, sheetName)
          return { sheetName, data: convertedData, success: true }
        } catch (error) {
          console.error(`Error fetching ${sheetName}:`, error)
          return { sheetName, data: [], success: false, error: error.message }
        }
      })
    )

    // 結果を整形
    const salesData = {
      overall: [],
      tokyo: [],
      osaka: [],
      nagoya: [],
      hatakeyama: [],
      errors: []
    }

    results.forEach(result => {
      if (result.success) {
        switch (result.sheetName) {
          case '全体':
            salesData.overall = result.data
            break
          case '東京':
            salesData.tokyo = result.data
            break
          case '大阪':
            salesData.osaka = result.data
            break
          case '名古屋':
            salesData.nagoya = result.data
            break
          case '畠山部':
            salesData.hatakeyama = result.data
            break
        }
      } else {
        salesData.errors.push({
          sheet: result.sheetName,
          error: result.error
        })
      }
    })

    return salesData
  } catch (error) {
    console.error('Error fetching all sales sheets:', error)
    throw error
  }
}
