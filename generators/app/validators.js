function name(input) {
	// disallow uppercase and most symbols
	const regex = /[!@#$%^&*\(\)+=_,.~`{}\[\]<>/0-9\s]/g;
	if (regex.test(input)) {
		return false;
	}

	return true;
}

function version(input) {
	// disallow uppercase and most symbols
	const regex = /[!@#$%^&*\(\)+=_,~`{}\[\]<>/\s]/g;
	if (regex.test(input)) {
		return false;
	}

	return true;
}

function spec(input) {
	if (input) {
		return true;
	}
	return false;
}

module.exports = {
	name,
	version,
	spec
};
