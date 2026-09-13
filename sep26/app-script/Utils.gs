function getSpreadsheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Hackathon spreadsheet could not be found.");
  }

  return spreadsheet;
}


function normalizeHeaderKey(key) {
  return String(key || "").trim().replace(/[\s_-]+/g, "").toUpperCase();
}


function getSheet(sheetName) {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  return sheet;
}


function getSheetRecords(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });

  const seenNormalized = {};
  headers.forEach(function(header) {
    const norm = normalizeHeaderKey(header);
    if (norm) {
      if (seenNormalized[norm]) {
        throw new Error("Duplicate normalized header '" + norm + "' found in sheet '" + sheetName + "' headers.");
      }
      seenNormalized[norm] = header;
    }
  });

  return values.slice(1).map(function(row) {
    const record = {};

    headers.forEach(function(header, index) {
      const val = row[index];
      record[header] = val;

      const normKey = normalizeHeaderKey(header);
      if (
        normKey === "TEAMID" ||
        normKey === "COLUMN1" ||
        ((sheetName === SHEET_NAMES.TEAMS || sheetName === SHEET_NAMES.SELECTIONS) && index === 0)
      ) {
        record.TeamID = val;
        record["Team ID"] = val;
        record.teamId = val;
      } else if (normKey === "TEAMNAME") {
        record.TeamName = val;
        record["Team Name"] = val;
      } else if (normKey === "LEADEREMAIL") {
        record.LeaderEmail = val;
      } else if (normKey === "DOMAINID") {
        record.DomainID = val;
      } else if (normKey === "STATUS") {
        record.Status = val;
      } else if (normKey === "CREATEDAT") {
        record.CreatedAt = val;
      }
    });

    return record;
  });
}


function getSheetHeaderMap(sheetName) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerMap = {};

  headers.forEach(function(header, index) {
    headerMap[String(header).trim()] = index + 1;
  });

  return headerMap;
}


function findSheetRowNumber(sheetName, headerName, value) {
  const sheet = getSheet(sheetName);
  const headerMap = getSheetHeaderMap(sheetName);
  const column = headerMap[headerName];

  if (!column || sheet.getLastRow() < 2) {
    return null;
  }

  const expected = String(value || "").trim();
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === expected) {
      return i + 2;
    }
  }

  return null;
}


function normalizeEmail(email) {
  if (!email) {
    return "";
  }

  return String(email).trim().toLowerCase();
}


function normalizeRegisterNumber(registerNumber) {
  if (!registerNumber) {
    return "";
  }

  return String(registerNumber).trim().toUpperCase();
}


var _configCacheMap = null;

function getAllConfigMap(forceRefresh) {
  if (_configCacheMap && !forceRefresh) {
    return _configCacheMap;
  }
  const sheet = getSheet(SHEET_NAMES.CONFIG);
  const data = sheet.getDataRange().getValues();
  const map = {};
  if (data.length >= 1) {
    const headers = data[0];
    const values = data.length >= 2 ? data[1] : [];
    for (let i = 0; i < headers.length; i++) {
      const k = String(headers[i] || "").trim();
      if (k) {
        map[k] = values[i] !== undefined ? values[i] : null;
      }
    }
  }
  _configCacheMap = map;
  return map;
}


function getConfigValue(key) {
  const targetKey = String(key || "").trim();
  const map = getAllConfigMap(false);
  return Object.prototype.hasOwnProperty.call(map, targetKey) ? map[targetKey] : null;
}


function setConfigValue(key, value) {
  const sheet = getSheet(SHEET_NAMES.CONFIG);
  const targetKey = String(key || "").trim();
  const targetNorm = normalizeHeaderKey(targetKey);
  const lastCol = sheet.getLastColumn();

  if (lastCol >= 1) {
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (let i = 0; i < headers.length; i++) {
      if (normalizeHeaderKey(headers[i]) === targetNorm) {
        sheet.getRange(2, i + 1).setValue(value);
        SpreadsheetApp.flush();
        _configCacheMap = null;
        return;
      }
    }
  }

  const newCol = Math.max(lastCol, 0) + 1;
  sheet.getRange(1, newCol).setValue(targetKey);
  sheet.getRange(2, newCol).setValue(value);
  SpreadsheetApp.flush();
  _configCacheMap = null;
}


function parseConfiguredDateTime(dateValue, timeValue) {
  if (dateValue instanceof Date && isNaN(dateValue.getTime())) {
    return null;
  }

  if (timeValue instanceof Date && isNaN(timeValue.getTime())) {
    return null;
  }

  const dateText = dateValue instanceof Date
    ? Utilities.formatDate(dateValue, APP_TIME_ZONE, "yyyy-MM-dd")
    : String(dateValue || "").trim();
  const timeText = timeValue instanceof Date
    ? Utilities.formatDate(timeValue, APP_TIME_ZONE, "HH:mm:ss")
    : String(timeValue || "").trim();

  if (!dateText) {
    return null;
  }

  if (!timeText) {
    const directParsed = new Date(dateText);
    if (!isNaN(directParsed.getTime())) {
      return directParsed;
    }
    return null;
  }

  const normalizedDate = normalizeConfiguredDate(dateText);
  const normalizedTime = normalizeConfiguredTime(timeText);

  if (!normalizedDate || !normalizedTime) {
    return null;
  }

  const formats = [
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm",
    "dd/MM/yyyy HH:mm:ss",
    "dd/MM/yyyy HH:mm",
    "MM/dd/yyyy HH:mm:ss",
    "MM/dd/yyyy HH:mm"
  ];

  for (let i = 0; i < formats.length; i++) {
    try {
      const parsed = Utilities.parseDate(
        normalizedDate + " " + normalizedTime,
        APP_TIME_ZONE,
        formats[i]
      );

      if (parsed && !isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (error) {
      // Try the next supported representation.
    }
  }

  return null;
}


function normalizeConfiguredDate(value) {
  const text = String(value || "").trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const parts = text.split("-");
    return parts[0] + "-" + padNumber(parts[1]) + "-" + padNumber(parts[2]);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    return text;
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const parts = text.split("/");
    return parts[0] + "-" + padNumber(parts[1]) + "-" + padNumber(parts[2]);
  }

  return "";
}


function normalizeConfiguredTime(value) {
  const text = String(value || "").trim();

  const twelveHourMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);

  if (twelveHourMatch) {
    let hour = Number(twelveHourMatch[1]);
    const minute = twelveHourMatch[2];
    const second = twelveHourMatch[3] || "00";
    const meridiem = twelveHourMatch[4].toUpperCase();

    if (hour < 1 || hour > 12) {
      return "";
    }

    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }

    if (meridiem === "PM" && hour !== 12) {
      hour += 12;
    }

    return padNumber(hour) + ":" + minute + ":" + second;
  }

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return text + ":00";
  }

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  return "";
}


function padNumber(value) {
  return String(value).length === 1 ? "0" + value : String(value);
}


function isProblemReleased() {
  const override = String(getConfigValue("ProblemReleaseOverride") || "")
    .trim()
    .toUpperCase();

  if (override === "TRUE") {
    return true;
  }

  const releaseAt = getProblemReleaseAt();

  return releaseAt !== null && new Date().getTime() >= releaseAt.getTime();
}


function getProblemReleaseAt() {
  return parseConfiguredDateTime(
    getConfigValue("ProblemReleaseDate"),
    getConfigValue("ProblemReleaseTime")
  );
}


function getProblemCloseAt() {
  const combined = getConfigValue("PROBLEM_CLOSE_DATETIME");
  if (!combined) return null;
  if (combined instanceof Date) return isNaN(combined.getTime()) ? null : combined;
  const parsed = new Date(String(combined).trim());
  return isNaN(parsed.getTime()) ? null : parsed;
}


function isSelectionOpen() {
  if (!isProblemReleased()) return false;
  const closeAt = getProblemCloseAt();
  const now = new Date();
  if (closeAt && now.getTime() >= closeAt.getTime()) return false;
  const status = String(getConfigValue("SelectionStatus") || "").trim().toUpperCase();
  return status === "" || status === SELECTION_STATUS.OPEN;
}


function getParticipantSelectionState() {
  if (!isProblemReleased()) return "NOT_RELEASED";
  const closeAt = getProblemCloseAt();
  if (closeAt && new Date().getTime() >= closeAt.getTime()) return SELECTION_STATUS.CLOSED;
  const status = String(getConfigValue("SelectionStatus") || "").trim().toUpperCase();
  if (status === SELECTION_STATUS.CLOSED) return SELECTION_STATUS.CLOSED;
  return SELECTION_STATUS.OPEN;
}


function isRegistrationOpen() {
  const enabledValue = getConfigValue("REGISTRATION_ENABLED");
  if (enabledValue !== null && enabledValue !== undefined && String(enabledValue).trim() !== "") {
    const enabledStr = String(enabledValue).trim().toUpperCase();
    if (enabledStr === "FALSE") {
      return false;
    }
  }

  const deadlineValue = getConfigValue("REGISTRATION_DEADLINE");
  if (deadlineValue !== null && deadlineValue !== undefined && String(deadlineValue).trim() !== "") {
    let deadlineDate = null;
    if (deadlineValue instanceof Date) {
      deadlineDate = deadlineValue;
    } else {
      const parsedStr = String(deadlineValue).trim();
      if (parsedStr) {
        deadlineDate = new Date(parsedStr);
      }
    }

    if (deadlineDate && !isNaN(deadlineDate.getTime())) {
      if (new Date().getTime() >= deadlineDate.getTime()) {
        return false;
      }
    }
  }

  return true;
}


function checkRegistrationOpen() {
  if (!isRegistrationOpen()) {
    throwApiError("Registration has closed.", "REGISTRATION_CLOSED");
  }
}


function isSelectionResetAllowed() {
  const v1 = String(getConfigValue("ALLOW_SELECTION_RESET") || "").trim().toUpperCase();
  const v2 = String(getConfigValue("AllowResetSelection") || "").trim().toUpperCase();
  const v3 = String(getConfigValue("AllowSelectionReset") || "").trim().toUpperCase();
  return v1 === "TRUE" || v2 === "TRUE" || v3 === "TRUE";
}


function requireSelectionResetAllowed() {
  if (!isSelectionResetAllowed()) {
    throwApiError(
      "Selection reset is not currently allowed. Set ALLOW_SELECTION_RESET = TRUE in Config to enable.",
      "RESET_NOT_ALLOWED"
    );
  }
}
