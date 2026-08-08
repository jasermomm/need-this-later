package app.needthislater.mobile;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class AppUnitTest {
    @Test
    public void packageNameIsStable() {
        assertEquals("app.needthislater.mobile", MainActivity.class.getPackage().getName());
    }
}
