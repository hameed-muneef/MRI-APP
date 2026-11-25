package com.alrabbaniyoon.app;

/*
 * Port of adhan-js 4.4.6 (https://github.com/batoulapps/adhan-js), MIT License, Copyright (c) 2016 Batoul Apps.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of the original software and
 * associated documentation files, to deal in the Software without restriction, subject to the following condition:
 * the above copyright notice and this permission notice shall be included in all copies or substantial portions of
 * the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */
/**
 * Faithful Java port of the adhan-js 4.4.6 algorithm exactly as the app's JS scheduler uses it
 * (src/lib/prayer-schedule.ts): default MiddleOfTheNight high-latitude rule, polar-circle resolution
 * left Unresolved, rounding "nearest" (Singapore: "up"), no extra manual adjustments.
 * Every result is checked against fixtures generated from the JS implementation by PrayerParityTest.
 * Times are epoch milliseconds as doubles; NaN means "not computable" like an invalid JS Date.
 */
public final class PrayerTimesCalculator {
    private PrayerTimesCalculator() {}

    public static final String[] METHODS = {
        "MuslimWorldLeague", "Egyptian", "Karachi", "UmmAlQura", "Dubai", "MoonsightingCommittee",
        "NorthAmerica", "Kuwait", "Qatar", "Singapore", "Tehran", "Turkey"
    };

    public static boolean isSupportedMethod(String method) {
        for (String m : METHODS) if (m.equals(method)) return true;
        return false;
    }

    private static final class Params {
        String method;
        double fajrAngle, ishaAngle, maghribAngle;
        int ishaInterval;
        boolean hanafi;
        // method adjustments in minutes
        double adjFajr, adjSunrise, adjDhuhr, adjAsr, adjMaghrib, adjIsha;
        boolean roundUp;
    }

    private static Params paramsFor(String method, boolean hanafi) {
        Params p = new Params();
        p.hanafi = hanafi;
        String m = isSupportedMethod(method) ? method : "MuslimWorldLeague";
        p.method = m;
        switch (m) {
            case "MuslimWorldLeague": p.fajrAngle = 18; p.ishaAngle = 17; p.adjDhuhr = 1; break;
            case "Egyptian": p.fajrAngle = 19.5; p.ishaAngle = 17.5; p.adjDhuhr = 1; break;
            case "Karachi": p.fajrAngle = 18; p.ishaAngle = 18; p.adjDhuhr = 1; break;
            case "UmmAlQura": p.fajrAngle = 18.5; p.ishaAngle = 0; p.ishaInterval = 90; break;
            case "Dubai": p.fajrAngle = 18.2; p.ishaAngle = 18.2; p.adjSunrise = -3; p.adjDhuhr = 3; p.adjAsr = 3; p.adjMaghrib = 3; break;
            case "MoonsightingCommittee": p.fajrAngle = 18; p.ishaAngle = 18; p.adjDhuhr = 5; p.adjMaghrib = 3; break;
            case "NorthAmerica": p.fajrAngle = 15; p.ishaAngle = 15; p.adjDhuhr = 1; break;
            case "Kuwait": p.fajrAngle = 18; p.ishaAngle = 17.5; break;
            case "Qatar": p.fajrAngle = 18; p.ishaAngle = 0; p.ishaInterval = 90; break;
            case "Singapore": p.fajrAngle = 20; p.ishaAngle = 18; p.adjDhuhr = 1; p.roundUp = true; break;
            case "Tehran": p.fajrAngle = 17.7; p.ishaAngle = 14; p.maghribAngle = 4.5; break;
            case "Turkey": p.fajrAngle = 18; p.ishaAngle = 17; p.adjSunrise = -7; p.adjDhuhr = 5; p.adjAsr = 4; p.adjMaghrib = 7; break;
            default: break;
        }
        return p;
    }

    /** Minimal proleptic-Gregorian civil date (java.time is unavailable below API 26). */
    private static final class LocalDate {
        final int year, month, day;
        LocalDate(int y, int m, int d) { year = y; month = m; day = d; }
        static LocalDate of(int y, int m, int d) { return new LocalDate(y, m, d); }
        int getYear() { return year; }
        int getMonthValue() { return month; }
        int getDayOfMonth() { return day; }
        long toEpochDay() {
            long y = year - (month <= 2 ? 1 : 0);
            long era = Math.floorDiv(y, 400L);
            long yoe = y - era * 400;
            long mp = (month + 9) % 12;
            long doy = (153 * mp + 2) / 5 + day - 1;
            long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
            return era * 146097 + doe - 719468;
        }
        long startOfDayUtcMs() { return toEpochDay() * 86400000L; }
        LocalDate plusDays(long n) {
            long z = toEpochDay() + n + 719468;
            long era = Math.floorDiv(z, 146097L);
            long doe = z - era * 146097;
            long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
            long y = yoe + era * 400;
            long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            long mp = (5 * doy + 2) / 153;
            long d = doy - (153 * mp + 2) / 5 + 1;
            long m = mp < 10 ? mp + 3 : mp - 9;
            return new LocalDate((int) (y + (m <= 2 ? 1 : 0)), (int) m, (int) d);
        }
    }

    // ---- math helpers (StrictMath = fdlibm, the same family V8 uses) ----
    private static double rad(double d) { return d * StrictMath.PI / 180.0; }
    private static double deg(double r) { return r * 180.0 / StrictMath.PI; }
    private static double normalizeToScale(double n, double max) { return n - max * StrictMath.floor(n / max); }
    private static double unwind(double a) { return normalizeToScale(a, 360.0); }
    private static double quadrantShift(double a) {
        if (a >= -180 && a <= 180) return a;
        return a - 360 * jsRound(a / 360);
    }
    /** JS Math.round: round half toward +infinity. */
    private static double jsRound(double x) { return StrictMath.floor(x + 0.5); }
    private static double trunc(double x) { return x < 0 ? StrictMath.ceil(x) : StrictMath.floor(x); }

    // ---- astronomical ----
    private static double meanSolarLongitude(double T) {
        return unwind(280.4664567 + 36000.76983 * T + 0.0003032 * StrictMath.pow(T, 2));
    }
    private static double meanLunarLongitude(double T) { return unwind(218.3165 + 481267.8813 * T); }
    private static double ascendingLunarNode(double T) {
        return unwind(125.04452 - 1934.136261 * T + 0.0020708 * StrictMath.pow(T, 2) + StrictMath.pow(T, 3) / 450000);
    }
    private static double meanSolarAnomaly(double T) {
        return unwind(357.52911 + 35999.05029 * T - 0.0001537 * StrictMath.pow(T, 2));
    }
    private static double solarEquationOfCenter(double T, double M) {
        double Mrad = rad(M);
        double t1 = (1.914602 - 0.004817 * T - 0.000014 * StrictMath.pow(T, 2)) * StrictMath.sin(Mrad);
        double t2 = (0.019993 - 0.000101 * T) * StrictMath.sin(2 * Mrad);
        double t3 = 0.000289 * StrictMath.sin(3 * Mrad);
        return t1 + t2 + t3;
    }
    private static double apparentSolarLongitude(double T, double L0) {
        double longitude = L0 + solarEquationOfCenter(T, meanSolarAnomaly(T));
        double omega = 125.04 - 1934.136 * T;
        double lambda = longitude - 0.00569 - 0.00478 * StrictMath.sin(rad(omega));
        return unwind(lambda);
    }
    private static double meanObliquity(double T) {
        return 23.439291 - 0.013004167 * T - 0.0000001639 * StrictMath.pow(T, 2) + 0.0000005036 * StrictMath.pow(T, 3);
    }
    private static double apparentObliquity(double T, double eps0) {
        double O = 125.04 - 1934.136 * T;
        return eps0 + 0.00256 * StrictMath.cos(rad(O));
    }
    private static double meanSiderealTime(double T) {
        double JD = T * 36525 + 2451545.0;
        double theta = 280.46061837 + 360.98564736629 * (JD - 2451545) + 0.000387933 * StrictMath.pow(T, 2) - StrictMath.pow(T, 3) / 38710000;
        return unwind(theta);
    }
    private static double nutationInLongitude(double L0, double Lp, double Omega) {
        double t1 = -17.2 / 3600 * StrictMath.sin(rad(Omega));
        double t2 = 1.32 / 3600 * StrictMath.sin(2 * rad(L0));
        double t3 = 0.23 / 3600 * StrictMath.sin(2 * rad(Lp));
        double t4 = 0.21 / 3600 * StrictMath.sin(2 * rad(Omega));
        return t1 - t2 - t3 + t4;
    }
    private static double nutationInObliquity(double L0, double Lp, double Omega) {
        double t1 = 9.2 / 3600 * StrictMath.cos(rad(Omega));
        double t2 = 0.57 / 3600 * StrictMath.cos(2 * rad(L0));
        double t3 = 0.1 / 3600 * StrictMath.cos(2 * rad(Lp));
        double t4 = 0.09 / 3600 * StrictMath.cos(2 * rad(Omega));
        return t1 + t2 + t3 - t4;
    }
    private static double altitudeOfCelestialBody(double lat, double decl, double H) {
        double t1 = StrictMath.sin(rad(lat)) * StrictMath.sin(rad(decl));
        double t2 = StrictMath.cos(rad(lat)) * StrictMath.cos(rad(decl)) * StrictMath.cos(rad(H));
        return deg(StrictMath.asin(t1 + t2));
    }
    private static double approximateTransit(double L, double theta0, double a2) {
        double Lw = L * -1;
        double m0 = normalizeToScale((a2 + Lw - theta0) / 360, 1);
        double expected = normalizeToScale((12.0 - L / 15.0) / 24.0, 1);
        if (m0 - expected > 0.5) return m0 - 1.0;
        else if (expected - m0 > 0.5) return m0 + 1.0;
        else return m0;
    }
    private static double interpolate(double y2, double y1, double y3, double n) {
        double a = y2 - y1, b = y3 - y2, c = b - a;
        return y2 + n / 2 * (a + b + n * c);
    }
    private static double interpolateAngles(double y2, double y1, double y3, double n) {
        double a = unwind(y2 - y1), b = unwind(y3 - y2), c = b - a;
        return y2 + n / 2 * (a + b + n * c);
    }
    private static double correctedTransit(double m0, double L, double theta0, double a2, double a1, double a3) {
        double Lw = L * -1;
        double theta = unwind(theta0 + 360.985647 * m0);
        double a = unwind(interpolateAngles(a2, a1, a3, m0));
        double H = quadrantShift(theta - Lw - a);
        double dm = H / -360;
        return (m0 + dm) * 24;
    }
    private static double correctedHourAngle(double m0, double h0, double lat, double lon, boolean after, double theta0,
                                             double a2, double a1, double a3, double d2, double d1, double d3) {
        double Lw = lon * -1;
        double term1 = StrictMath.sin(rad(h0)) - StrictMath.sin(rad(lat)) * StrictMath.sin(rad(d2));
        double term2 = StrictMath.cos(rad(lat)) * StrictMath.cos(rad(d2));
        double H0 = deg(StrictMath.acos(term1 / term2));
        double m = after ? m0 + H0 / 360 : m0 - H0 / 360;
        double theta = unwind(theta0 + 360.985647 * m);
        double a = unwind(interpolateAngles(a2, a1, a3, m));
        double delta = interpolate(d2, d1, d3, m);
        double H = theta - Lw - a;
        double h = altitudeOfCelestialBody(lat, delta, H);
        double term3 = h - h0;
        double term4 = 360 * StrictMath.cos(rad(delta)) * StrictMath.cos(rad(lat)) * StrictMath.sin(rad(H));
        double dm = term3 / term4;
        return (m + dm) * 24;
    }
    private static double julianDay(int year, int month, int day) {
        double Y = trunc(month > 2 ? year : year - 1);
        double M = trunc(month > 2 ? month : month + 12);
        double D = day + 0.0 / 24;
        double A = trunc(Y / 100);
        double B = trunc(2 - A + trunc(A / 4));
        double i0 = trunc(365.25 * (Y + 4716));
        double i1 = trunc(30.6001 * (M + 1));
        return i0 + i1 + D + B - 1524.5;
    }

    private static final class Solar {
        final double declination, rightAscension, apparentSiderealTime;
        Solar(double jd) {
            double T = (jd - 2451545.0) / 36525;
            double L0 = meanSolarLongitude(T);
            double Lp = meanLunarLongitude(T);
            double Omega = ascendingLunarNode(T);
            double Lambda = rad(apparentSolarLongitude(T, L0));
            double Theta0 = meanSiderealTime(T);
            double dPsi = nutationInLongitude(L0, Lp, Omega);
            double dEps = nutationInObliquity(L0, Lp, Omega);
            double eps0 = meanObliquity(T);
            double epsApp = rad(apparentObliquity(T, eps0));
            declination = deg(StrictMath.asin(StrictMath.sin(epsApp) * StrictMath.sin(Lambda)));
            rightAscension = unwind(deg(StrictMath.atan2(StrictMath.cos(epsApp) * StrictMath.sin(Lambda), StrictMath.cos(Lambda))));
            apparentSiderealTime = Theta0 + dPsi * 3600 * StrictMath.cos(rad(eps0 + dEps)) / 3600;
        }
    }

    private static final class SolarTime {
        final double lat, lon, approxTransit, transit, sunrise, sunset;
        final Solar solar, prev, next;
        SolarTime(LocalDate date, double lat, double lon) {
            this.lat = lat; this.lon = lon;
            double jd = julianDay(date.getYear(), date.getMonthValue(), date.getDayOfMonth());
            solar = new Solar(jd); prev = new Solar(jd - 1); next = new Solar(jd + 1);
            double m0 = approximateTransit(lon, solar.apparentSiderealTime, solar.rightAscension);
            double alt = -50.0 / 60.0;
            approxTransit = m0;
            transit = correctedTransit(m0, lon, solar.apparentSiderealTime, solar.rightAscension, prev.rightAscension, next.rightAscension);
            sunrise = hourAngle(alt, false);
            sunset = hourAngle(alt, true);
        }
        double hourAngle(double angle, boolean after) {
            return correctedHourAngle(approxTransit, angle, lat, lon, after, solar.apparentSiderealTime, solar.rightAscension,
                prev.rightAscension, next.rightAscension, solar.declination, prev.declination, next.declination);
        }
        double afternoon(double shadowLength) {
            double tangent = StrictMath.abs(lat - solar.declination);
            double inverse = shadowLength + StrictMath.tan(rad(tangent));
            double angle = deg(StrictMath.atan(1.0 / inverse));
            return hourAngle(angle, true);
        }
    }

    // ---- date helpers: epoch ms doubles, NaN = invalid ----
    /** TimeComponents(num).utcDate(y, m, d) -> epoch ms, mirroring Date.UTC overflow behaviour. */
    private static double utcDate(double num, LocalDate date) {
        if (Double.isNaN(num) || Double.isInfinite(num)) return Double.NaN;
        double hours = StrictMath.floor(num);
        double minutes = StrictMath.floor((num - hours) * 60);
        double seconds = StrictMath.floor((num - (hours + minutes / 60)) * 60 * 60);
        long dayMs = date.startOfDayUtcMs();
        return dayMs + hours * 3600000.0 + minutes * 60000.0 + seconds * 1000.0;
    }
    /** new Date(t + seconds * 1000): Date truncates the time value toward zero. */
    private static double addSeconds(double t, double seconds) {
        if (Double.isNaN(t) || Double.isNaN(seconds)) return Double.NaN;
        return trunc(t + seconds * 1000);
    }
    private static double addMinutes(double t, double minutes) { return addSeconds(t, minutes * 60); }
    private static double roundedMinute(double t, boolean up) {
        if (Double.isNaN(t)) return Double.NaN;
        long ms = (long) t;
        long sec = Math.floorMod(Math.floorDiv(ms, 1000L), 60L);
        long offset = sec >= 30 ? 60 - sec : -1 * sec;
        if (up) offset = 60 - sec;
        return addSeconds(t, offset);
    }
    private static boolean isLeap(int y) {
        if (y % 4 != 0) return false;
        return !(y % 100 == 0 && y % 400 != 0);
    }
    private static int dayOfYear(LocalDate d) {
        int feb = isLeap(d.getYear()) ? 29 : 28;
        int[] months = {31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        int r = 0;
        for (int i = 0; i < d.getMonthValue() - 1; i++) r += months[i];
        return r + d.getDayOfMonth();
    }

    // ---- moonsighting seasonal twilight ----
    private static int daysSinceSolstice(int dayOfYear, int year, double latitude) {
        int dss;
        int northern = 10;
        int southern = isLeap(year) ? 173 : 172;
        int daysInYear = isLeap(year) ? 366 : 365;
        if (latitude >= 0) {
            dss = dayOfYear + northern;
            if (dss >= daysInYear) dss -= daysInYear;
        } else {
            dss = dayOfYear - southern;
            if (dss < 0) dss += daysInYear;
        }
        return dss;
    }
    private static double seasonAdjust(double a, double b, double c, double d, int dyy) {
        if (dyy < 91) return a + (b - a) / 91.0 * dyy;
        else if (dyy < 137) return b + (c - b) / 46.0 * (dyy - 91);
        else if (dyy < 183) return c + (d - c) / 46.0 * (dyy - 137);
        else if (dyy < 229) return d + (c - d) / 46.0 * (dyy - 183);
        else if (dyy < 275) return c + (b - c) / 46.0 * (dyy - 229);
        else return b + (a - b) / 91.0 * (dyy - 275);
    }
    private static double seasonAdjustedMorningTwilight(double lat, int doy, int year, double sunrise) {
        double al = StrictMath.abs(lat);
        double a = 75 + 28.65 / 55.0 * al, b = 75 + 19.44 / 55.0 * al, c = 75 + 32.74 / 55.0 * al, d = 75 + 48.1 / 55.0 * al;
        double adj = seasonAdjust(a, b, c, d, daysSinceSolstice(doy, year, lat));
        return addSeconds(sunrise, jsRound(adj * -60.0));
    }
    /** shafaq "general" is the only value this app uses (default). */
    private static double seasonAdjustedEveningTwilight(double lat, int doy, int year, double sunset) {
        double al = StrictMath.abs(lat);
        double a = 75 + 25.6 / 55.0 * al, b = 75 + 2.05 / 55.0 * al, c = 75 - 9.21 / 55.0 * al, d = 75 + 6.14 / 55.0 * al;
        double adj = seasonAdjust(a, b, c, d, daysSinceSolstice(doy, year, lat));
        return addSeconds(sunset, jsRound(adj * 60.0));
    }

    /**
     * Computes the five prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha) in epoch ms for the given local calendar date,
     * before any user adjust_minutes. NaN where JS adhan would produce an invalid date.
     */
    public static double[] compute(double latitude, double longitude, String method, boolean hanafi, int year, int month, int day) {
        Params p = paramsFor(method, hanafi);
        LocalDate date = LocalDate.of(year, month, day);
        SolarTime solar = new SolarTime(date, latitude, longitude);
        double dhuhrTime = utcDate(solar.transit, date);
        double sunriseTime = utcDate(solar.sunrise, date);
        double sunsetTime = utcDate(solar.sunset, date);
        LocalDate tomorrow = date.plusDays(1);
        SolarTime tomorrowSolar = new SolarTime(tomorrow, latitude, longitude);
        double asrTime = utcDate(solar.afternoon(p.hanafi ? 2 : 1), date);
        double tomorrowSunrise = utcDate(tomorrowSolar.sunrise, tomorrow);
        double night = (tomorrowSunrise - sunsetTime) / 1000;
        double fajrTime = utcDate(solar.hourAngle(-1 * p.fajrAngle, false), date);

        boolean moon = p.method.equals("MoonsightingCommittee");
        if (moon && latitude >= 55) {
            double nightFraction = night / 7;
            fajrTime = addSeconds(sunriseTime, -nightFraction);
        }
        double safeFajr;
        if (moon) {
            safeFajr = seasonAdjustedMorningTwilight(latitude, dayOfYear(date), year, sunriseTime);
        } else {
            double portion = 1.0 / 2; // MiddleOfTheNight (the app never sets another rule)
            double nightFraction = portion * night;
            safeFajr = addSeconds(sunriseTime, -nightFraction);
        }
        if (Double.isNaN(fajrTime) || safeFajr > fajrTime) fajrTime = safeFajr;

        double ishaTime;
        if (p.ishaInterval > 0) {
            ishaTime = addMinutes(sunsetTime, p.ishaInterval);
        } else {
            ishaTime = utcDate(solar.hourAngle(-1 * p.ishaAngle, true), date);
            if (moon && latitude >= 55) {
                double nightFraction = night / 7;
                ishaTime = addSeconds(sunsetTime, nightFraction);
            }
            double safeIsha;
            if (moon) {
                safeIsha = seasonAdjustedEveningTwilight(latitude, dayOfYear(date), year, sunsetTime);
            } else {
                double portion = 1.0 / 2;
                double nightFraction = portion * night;
                safeIsha = addSeconds(sunsetTime, nightFraction);
            }
            if (Double.isNaN(ishaTime) || safeIsha < ishaTime) ishaTime = safeIsha;
        }
        double maghribTime = sunsetTime;
        if (p.maghribAngle != 0) {
            double angleBased = utcDate(solar.hourAngle(-1 * p.maghribAngle, true), date);
            if (sunsetTime < angleBased && ishaTime > angleBased) maghribTime = angleBased;
        }
        double fajr = roundedMinute(addMinutes(fajrTime, p.adjFajr), p.roundUp);
        double dhuhr = roundedMinute(addMinutes(dhuhrTime, p.adjDhuhr), p.roundUp);
        double asr = roundedMinute(addMinutes(asrTime, p.adjAsr), p.roundUp);
        double maghrib = roundedMinute(addMinutes(maghribTime, p.adjMaghrib), p.roundUp);
        double isha = roundedMinute(addMinutes(ishaTime, p.adjIsha), p.roundUp);
        return new double[] {fajr, dhuhr, asr, maghrib, isha};
    }
}
