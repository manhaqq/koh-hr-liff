/*******************************************************************
 * tests/sheets-mock.js — สเปรดชีตจำลองที่ "มีเซลล์จริง"
 *
 * ★ ทำไมต้องมีไฟล์นี้ ทั้งที่ mock.js มี MockSheet อยู่แล้ว
 *   MockSheet ใน mock.js พอสำหรับ 12_Backup.js ซึ่งแตะแค่ระดับแท็บ
 *   (copyTo / setName / deleteSheet) แต่ 13_Forms.js กับ 14_Media.js
 *   เขียนลง "เซลล์" จริง ๆ ผ่าน getRange().setValues() แล้วอ่านกลับด้วย
 *   readTableRaw_ / headerIndex_ ซึ่งเป็นตัวตัดสินว่าหัวคอลัมน์อยู่แถวไหน
 *   ถ้า getRange คืนของปลอมที่ไม่จำค่า เราจะทดสอบ "แถวหัวคอลัมน์จริง"
 *   ไม่ได้เลย ซึ่งเป็นบั๊กเงียบที่ 14_Media.js เตือนไว้เองในคอมเมนต์ข้อ 4
 *
 * ★★ กฎเหล็กเดียวกับ mock.js ★★
 *   ใส่ได้เฉพาะเมธอดที่ยืนยันกับเอกสารทางการของ Google แล้วเท่านั้น
 *   ทุกเมธอดมี URL เอกสารกำกับ ถ้าโค้ดที่ทดสอบเรียกอะไรที่ไม่มีในนี้
 *   และหาในเอกสารไม่เจอ — นั่นคือบั๊ก ห้ามเติม mock เพื่อให้เทสต์เขียว
 *
 * ★ จำลองขอบเขตของชีตด้วย (maxRows/maxColumns)
 *   ของจริง getRange ที่เลยขอบชีตจะโยน error ไม่ได้ขยายให้เอง
 *   เป็นกับดักจริงตอนต่อคอลัมน์ที่ 27 ในชีตกว้าง 26 คอลัมน์
 *******************************************************************/

/* ── Range ────────────────────────────────────────────────────────
   https://developers.google.com/apps-script/reference/spreadsheet/range */
class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this._sh = sheet; this._r = row; this._c = col;
    this._nr = numRows; this._nc = numCols;
  }
  /* getRow / getColumn / getNumRows / getNumColumns
     https://developers.google.com/apps-script/reference/spreadsheet/range#getrow */
  getRow() { return this._r; }
  getColumn() { return this._c; }
  getNumRows() { return this._nr; }
  getNumColumns() { return this._nc; }

  /* getValues() → Object[][]  (ค่าดิบ: string | number | boolean | Date)
     https://developers.google.com/apps-script/reference/spreadsheet/range#getvalues */
  getValues() {
    var out = [];
    for (var i = 0; i < this._nr; i++) {
      var row = [];
      for (var j = 0; j < this._nc; j++) row.push(this._sh._get(this._r + i, this._c + j));
      out.push(row);
    }
    return out;
  }

  /* getDisplayValues() → String[][] — ของจริงคืน "ข้อความอย่างที่ตาเห็น" เสมอ
     https://developers.google.com/apps-script/reference/spreadsheet/range#getdisplayvalues */
  getDisplayValues() {
    return this.getValues().map(function (r) {
      return r.map(function (v) {
        if (v === '' || v === null || v === undefined) return '';
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        return String(v);
      });
    });
  }

  /* setValue(value) — เขียนค่าเดียวลงทุกเซลล์ในช่วง
     https://developers.google.com/apps-script/reference/spreadsheet/range#setvaluevalue */
  setValue(v) {
    for (var i = 0; i < this._nr; i++)
      for (var j = 0; j < this._nc; j++) this._sh._set(this._r + i, this._c + j, v);
    return this;
  }

  /* setValues(values) — ★ ของจริงโยน error ถ้าขนาดไม่ตรงช่วงเป๊ะ ๆ
     https://developers.google.com/apps-script/reference/spreadsheet/range#setvaluesvalues */
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this._nr) {
      throw new Error('The number of rows in the data does not match the number of rows in the range. ' +
                      'ข้อมูล ' + (Array.isArray(values) ? values.length : '?') + ' แถว แต่ช่วงกว้าง ' + this._nr + ' แถว');
    }
    for (var i = 0; i < this._nr; i++) {
      if (!Array.isArray(values[i]) || values[i].length !== this._nc) {
        throw new Error('The number of columns in the data does not match the number of columns in the range. ' +
                        'แถวที่ ' + (i + 1) + ' มี ' + (Array.isArray(values[i]) ? values[i].length : '?') +
                        ' ช่อง แต่ช่วงกว้าง ' + this._nc + ' ช่อง');
      }
      for (var j = 0; j < this._nc; j++) this._sh._set(this._r + i, this._c + j, values[i][j]);
    }
    return this;
  }

  /* จัดรูปแบบ — คืน Range เสมอ จึงต่อกันเป็นลูกโซ่ได้ (ของจริงก็ chainable)
     https://developers.google.com/apps-script/reference/spreadsheet/range#setbackgroundcolor
     https://developers.google.com/apps-script/reference/spreadsheet/range#setfontcolorcolor
     https://developers.google.com/apps-script/reference/spreadsheet/range#setfontweightfontweight
     https://developers.google.com/apps-script/reference/spreadsheet/range#setverticalalignmentalignment */
  setBackground(c) { this._sh._fmt.background = c; return this; }
  setFontColor(c) { this._sh._fmt.fontColor = c; return this; }
  setFontWeight(w) { this._sh._fmt.fontWeight = w; return this; }
  setVerticalAlignment(a) { this._sh._fmt.verticalAlignment = a; return this; }

  /* setNumberFormat(numberFormat)
     https://developers.google.com/apps-script/reference/spreadsheet/range#setnumberformatnumberformat */
  setNumberFormat(f) { this._sh._fmt.numberFormat = f; return this; }

  /* setWrap(isWrapEnabled)
     https://developers.google.com/apps-script/reference/spreadsheet/range#setwrapiswrapenabled */
  setWrap(b) { this._sh._fmt.wrap = b; return this; }
}

/* ── Sheet ────────────────────────────────────────────────────────
   https://developers.google.com/apps-script/reference/spreadsheet/sheet */
class MockGridSheet {
  constructor(name, parent, opts) {
    opts = opts || {};
    this._name = name;
    this._parent = parent;
    this._cells = {};                       /* "r:c" -> value */
    this._maxRows = opts.maxRows || 1000;   /* ค่าตั้งต้นของชีตใหม่จริง ๆ */
    this._maxCols = opts.maxColumns || 26;
    this._fmt = {};
    this._frozenRows = 0;
    this._rowHeights = {};
  }

  _get(r, c) { var v = this._cells[r + ':' + c]; return v === undefined ? '' : v; }
  _set(r, c, v) {
    this._bounds(r, c);
    if (v === '' || v === null || v === undefined) delete this._cells[r + ':' + c];
    else this._cells[r + ':' + c] = v;
  }
  _bounds(r, c) {
    /* ★ ของจริงไม่ขยายชีตให้เอง — เลยขอบเมื่อไหร่โยนทันที
       ข้อความเลียนของจริงเพื่อให้คนอ่าน log แล้วค้นเจอ */
    if (r < 1 || c < 1 || r > this._maxRows || c > this._maxCols) {
      throw new Error('The coordinates or dimensions of the range are invalid. ' +
                      'ขอ (แถว ' + r + ', คอลัมน์ ' + c + ') แต่ชีต "' + this._name +
                      '" มี ' + this._maxRows + ' แถว × ' + this._maxCols + ' คอลัมน์');
    }
  }

  /* getName / setName
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getname */
  getName() { return this._name; }
  setName(n) { this._name = n; return this; }

  /* getIndex / activate
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getindex */
  getIndex() { return this._parent._sheets.indexOf(this) + 1; }
  activate() { this._parent._active = this; return this; }

  /* getMaxRows / getMaxColumns
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getmaxrows */
  getMaxRows() { return this._maxRows; }
  getMaxColumns() { return this._maxCols; }

  /* getLastRow / getLastColumn — "แถว/คอลัมน์สุดท้ายที่มีข้อมูล" ไม่ใช่ขนาดชีต
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getlastrow */
  getLastRow() {
    var m = 0;
    for (var k in this._cells) { var r = Number(k.split(':')[0]); if (r > m) m = r; }
    return m;
  }
  getLastColumn() {
    var m = 0;
    for (var k in this._cells) { var c = Number(k.split(':')[1]); if (c > m) m = c; }
    return m;
  }

  /* getRange(row, column) | (row, column, numRows) | (row, column, numRows, numColumns)
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getrangerow,-column,-numrows,-numcolumns */
  getRange(row, col, numRows, numCols) {
    var nr = numRows === undefined ? 1 : numRows;
    var nc = numCols === undefined ? 1 : numCols;
    if (!(row >= 1) || !(col >= 1) || !(nr >= 1) || !(nc >= 1)) {
      throw new Error('The coordinates or dimensions of the range are invalid. ' +
                      'getRange(' + row + ', ' + col + ', ' + numRows + ', ' + numCols + ')');
    }
    this._bounds(row, col);
    this._bounds(row + nr - 1, col + nc - 1);
    return new MockRange(this, row, col, nr, nc);
  }

  /* getDataRange()
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getdatarange */
  getDataRange() {
    return new MockRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }

  /* appendRow(rowContents) — ต่อท้ายแถวที่มีข้อมูลแถวสุดท้ายเสมอ
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendrowrowcontents */
  appendRow(rowContents) {
    var r = this.getLastRow() + 1;
    for (var j = 0; j < rowContents.length; j++) this._set(r, j + 1, rowContents[j]);
    return this;
  }

  /* setFrozenRows / setRowHeight
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#setfrozenrowsrows */
  setFrozenRows(n) { this._frozenRows = n; return this; }
  getFrozenRows() { return this._frozenRows; }
  setRowHeight(row, h) { this._rowHeights[row] = h; return this; }

  /* copyTo(spreadsheet) — ★ ต่อท้ายเสมอ ตามพฤติกรรมจริง
     https://developers.google.com/apps-script/reference/spreadsheet/sheet#copytospreadsheet */
  copyTo(dest) {
    var c = new MockGridSheet('Copy of ' + this._name, dest,
      { maxRows: this._maxRows, maxColumns: this._maxCols });
    c._cells = Object.assign({}, this._cells);
    dest._sheets.push(c);
    return c;
  }
}

/* ── Spreadsheet ──────────────────────────────────────────────────
   https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet */
class MockGridSpreadsheet {
  constructor(id) { this._id = id; this._sheets = []; }

  getId() { return this._id; }
  getName() { return 'ss-' + this._id; }

  /* getSheets / getSheetByName
     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet#getsheetbynamename */
  getSheets() { return this._sheets.slice(); }
  getSheetByName(n) {
    for (var i = 0; i < this._sheets.length; i++) if (this._sheets[i].getName() === n) return this._sheets[i];
    return null;                                  /* ★ ของจริงคืน null ไม่ใช่ undefined ไม่ throw */
  }

  /* insertSheet(sheetName)
     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet#insertsheetsheetname */
  insertSheet(n) {
    if (n && this.getSheetByName(n)) {
      throw new Error('A sheet with the name "' + n + '" already exists. Please enter another name.');
    }
    var s = new MockGridSheet(n || 'Sheet' + (this._sheets.length + 1), this);
    this._sheets.push(s);
    return s;
  }

  /* deleteSheet(sheet)
     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet#deletesheetsheet */
  deleteSheet(sh) {
    var i = this._sheets.indexOf(sh);
    if (i < 0) throw new Error('deleteSheet: ไม่พบชีตนี้');
    this._sheets.splice(i, 1);
  }

  /* getSpreadsheetTimeZone()
     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet#getspreadsheettimezone */
  getSpreadsheetTimeZone() { return 'Asia/Bangkok'; }
}

/**
 * สร้างสเปรดชีตพร้อมข้อมูลตั้งต้น
 * @param {string} id
 * @param {Object} tabs  { ชื่อแท็บ: [[แถว],[แถว]] }  แถวแรกคือหัวคอลัมน์
 */
function makeSpreadsheet(id, tabs) {
  var ss = new MockGridSpreadsheet(id);
  Object.keys(tabs || {}).forEach(function (name) {
    var sh = ss.insertSheet(name);
    var rows = tabs[name] || [];
    rows.forEach(function (row, i) {
      row.forEach(function (v, j) { sh._set(i + 1, j + 1, v); });
    });
  });
  return ss;
}

module.exports = { MockGridSpreadsheet, MockGridSheet, MockRange, makeSpreadsheet };
