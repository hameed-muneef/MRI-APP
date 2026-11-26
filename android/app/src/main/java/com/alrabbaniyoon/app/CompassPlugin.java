package com.alrabbaniyoon.app;

import android.content.Context;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeCompass")
public class CompassPlugin extends Plugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private boolean running = false;
    private double declination = 0.0;
    private final float[] rotationMatrix = new float[9];
    private final float[] orientation = new float[3];
    private final float[] remapped = new float[9];
    private volatile int sensorAccuracy = SensorManager.SENSOR_STATUS_ACCURACY_HIGH;

    @Override
    public void load() {
        Context ctx = getContext();
        if (ctx == null) return;
        sensorManager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            if (rotationSensor == null) {
                rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (running && sensorManager != null) {
            sensorManager.unregisterListener(this);
            running = false;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", rotationSensor != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void setDeclination(PluginCall call) {
        double lat = call.getDouble("latitude", 0.0);
        double lon = call.getDouble("longitude", 0.0);
        double alt = call.getDouble("altitude", 0.0);
        try {
            GeomagneticField field = new GeomagneticField((float) lat, (float) lon, (float) alt, System.currentTimeMillis());
            declination = field.getDeclination();
        } catch (Exception e) {
            declination = 0.0;
        }
        JSObject ret = new JSObject();
        ret.put("declination", declination);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (sensorManager == null || rotationSensor == null) {
            call.reject("no-sensor");
            return;
        }
        if (!running) {
            sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_UI);
            running = true;
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (running && sensorManager != null) {
            sensorManager.unregisterListener(this);
            running = false;
        }
        call.resolve();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        int type = event.sensor.getType();
        if (type != Sensor.TYPE_ROTATION_VECTOR && type != Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) {
            return;
        }
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
        SensorManager.getOrientation(rotationMatrix, orientation);
        // The azimuth above assumes the phone lies flat. Held upright (the usual way people hold it to find the qibla),
        // it is wrong by tens of degrees, so remap the axes so the heading follows where the back of the phone points.
        double rawPitch = Math.toDegrees(orientation[1]);
        if (Math.abs(rawPitch) > 50.0) {
            SensorManager.remapCoordinateSystem(rotationMatrix, SensorManager.AXIS_X, SensorManager.AXIS_Z, remapped);
            SensorManager.getOrientation(remapped, orientation);
        }
        double azimuthDeg = Math.toDegrees(orientation[0]);
        if (azimuthDeg < 0) azimuthDeg += 360.0;
        double trueHeading = azimuthDeg + declination;
        if (trueHeading >= 360.0) trueHeading -= 360.0;
        if (trueHeading < 0) trueHeading += 360.0;
        double pitch = Math.toDegrees(orientation[1]);
        double roll = Math.toDegrees(orientation[2]);

        JSObject data = new JSObject();
        data.put("heading", trueHeading);
        data.put("magneticHeading", azimuthDeg);
        data.put("pitch", pitch);
        data.put("roll", roll);
        data.put("accuracy", sensorAccuracy);
        notifyListeners("heading", data);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        sensorAccuracy = accuracy;
    }
}
