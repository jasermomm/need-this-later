package app.needthislater.mobile;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppContextTest {
    @Test
    public void usesExpectedApplicationId() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("app.needthislater.mobile", context.getPackageName());
    }
}
