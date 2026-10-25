package com.wira.user;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * AppWidgetProvider for Wira AI Homescreen Widget.
 * Allows customers to quickly order or speak to Wira AI right from the phone's home screen.
 */
public class WiraAIWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.wira_ai_widget);

        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flag |= PendingIntent.FLAG_IMMUTABLE;
        }

        // Action 1: Tap search bar or widget body -> Open app directly to Wira AI sheet
        Intent searchIntent = new Intent(context, MainActivity.class);
        searchIntent.setAction(Intent.ACTION_VIEW);
        searchIntent.setData(Uri.parse("wira://ai?open_ai=true"));
        searchIntent.putExtra("open_ai", true);
        searchIntent.putExtra("auto_listen", false);
        searchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent searchPendingIntent = PendingIntent.getActivity(context, 100, searchIntent, flag);
        views.setOnClickPendingIntent(R.id.widget_container, searchPendingIntent);
        views.setOnClickPendingIntent(R.id.widget_search_bar, searchPendingIntent);

        // Action 2: Tap microphone button -> Open app directly to Wira AI sheet and start voice recognition immediately
        Intent micIntent = new Intent(context, MainActivity.class);
        micIntent.setAction(Intent.ACTION_VIEW);
        micIntent.setData(Uri.parse("wira://ai?open_ai=true&auto_listen=true"));
        micIntent.putExtra("open_ai", true);
        micIntent.putExtra("auto_listen", true);
        micIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent micPendingIntent = PendingIntent.getActivity(context, 101, micIntent, flag);
        views.setOnClickPendingIntent(R.id.widget_btn_mic, micPendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
