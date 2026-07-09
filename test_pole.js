const getValidPoles = (system) => {
  if (system.includes("3PH 4W") || system.includes("3PH, 5W")) {
    return ["1P", "1P+N", "2P", "3P", "3P+N", "4P"];
  } else if (system.includes("1PH 2W") || system.includes("1PH, 2W")) {
    return ["1P", "1P+N", "2P"];
  } else if (system.includes("1PH 3W") || system.includes("1PH, 3W")) {
    return ["1P", "1P+N", "2P"];
  } else if (system.includes("3PH 3W") || system.includes("3PH, 4W")) { // Wait, 3PH 4W?
    // In PEC, a 3PH 3W system doesn't have neutral.
    return ["2P", "3P"];
  }
  return ["1P", "2P", "3P", "4P"];
};
